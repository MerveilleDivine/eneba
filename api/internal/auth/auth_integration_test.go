//go:build integration

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/MerveilleDivine/eneba/api/internal/httpapi"
)

func TestAuthHTTPAndDatabase(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	parsed,err := url.Parse(dsn)
	if err!=nil || parsed.Path!="/eneba_test" || parsed.Hostname()=="" { t.Fatal("auth integration tests require isolated eneba_test") }
	ctx,cancel:=context.WithTimeout(context.Background(),30*time.Second)
	defer cancel()
	pool,err:=database.OpenPool(ctx,dsn)
	if err!=nil { t.Fatal(err) }
	defer pool.Close()
	repository:=NewRepository(pool)
	logger:=slog.New(slog.NewTextHandler(io.Discard,nil))
	h:=NewHandler(NewService(repository),logger,"http://127.0.0.1:5173",false)
	mux:=http.NewServeMux()
	h.RegisterRoutes(mux)
	server:=httptest.NewServer(httpapi.Wrap(mux,logger))
	defer server.Close()
	email:=fmt.Sprintf("slice5-%d@example.test",time.Now().UnixNano())
	defer func(){
		c,done:=context.WithTimeout(context.Background(),5*time.Second)
		defer done()
		if _,e:=pool.Exec(c,"DELETE FROM marketplace.users WHERE email=$1",email);e!=nil { t.Errorf("auth fixture cleanup: %v",e) }
	}()
	request:=func(method,path,body string,cookie *http.Cookie,origin string)(int,[]byte,*http.Cookie){
		t.Helper()
		req,err:=http.NewRequest(method,server.URL+path,bytes.NewBufferString(body))
		if err!=nil {t.Fatal(err)}
		if method=="POST" {req.Header.Set("Content-Type","application/json")}
		if origin!="" {req.Header.Set("Origin",origin)}
		if cookie!=nil {req.AddCookie(cookie)}
		res,err:=server.Client().Do(req)
		if err!=nil {t.Fatal(err)}
		defer res.Body.Close()
		data,_:=io.ReadAll(res.Body)
		var session *http.Cookie
		for _,c:=range res.Cookies() {if c.Name=="eneba_session" {session=c}}
		return res.StatusCode,data,session
	}
	for _, path := range []string{"/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/logout"} {
		if status, _, _ := request("POST", path, "{}", nil, "https://attacker.example"); status != 403 {
			t.Fatalf("%s accepted foreign Origin", path)
		}
		if status, _, _ := request("POST", path, "{}", nil, ""); status != 403 {
			t.Fatalf("%s accepted missing Origin", path)
		}
	}
	payload,_:=json.Marshal(map[string]string{"displayName":"Demo Buyer","email":email,"password":"correct password 123"})
	status,data,cookie:=request("POST","/api/v1/auth/register",string(payload),nil,"http://127.0.0.1:5173")
	if status!=201 || cookie==nil || !cookie.HttpOnly || cookie.Secure || cookie.SameSite!=http.SameSiteLaxMode || cookie.Path!="/" {
		t.Fatalf("registration status=%d cookie=%+v body=%s",status,cookie,data)
	}
	if strings.Contains(string(data),"password") || strings.Contains(string(data),cookie.Value) {t.Fatal("credentials leaked in JSON")}
	var hash string
	var tokenHash []byte
	err=pool.QueryRow(ctx,"SELECT u.password_hash,s.token_hash FROM marketplace.users u JOIN marketplace.sessions s ON s.user_id=u.id WHERE u.email=$1",email).Scan(&hash,&tokenHash)
	if err!=nil || hash=="correct password 123" || len(tokenHash)!=32 || strings.Contains(hash,"correct password") {t.Fatal("secret material stored in plaintext",err)}
	if n,_,_:=request("GET","/api/v1/auth/me","",cookie,"");n!=200 {t.Fatal("session not persisted")}
	if n,_,_:=request("GET","/api/v1/auth/me","",nil,"");n!=401 {t.Fatal("anonymous me not protected")}
	if n,_,_:=request("POST","/api/v1/auth/logout","",cookie,"https://attacker.example");n!=403 {t.Fatal("cross-origin logout accepted")}
	if n,_,_:=request("POST","/api/v1/auth/register",string(payload),nil,"http://127.0.0.1:5173");n!=409 {t.Fatal("duplicate email accepted")}
	bad,_:=json.Marshal(map[string]string{"email":email,"password":"incorrect password"})
	if n,_,_:=request("POST","/api/v1/auth/login",string(bad),nil,"http://127.0.0.1:5173");n!=401 {t.Fatal("incorrect password accepted")}
	good,_:=json.Marshal(map[string]string{"email":email,"password":"correct password 123"})
	n,_,fresh:=request("POST","/api/v1/auth/login",string(good),nil,"http://127.0.0.1:5173")
	if n!=200 || fresh==nil || fresh.Value==cookie.Value {t.Fatal("login did not rotate session")}
	if n,_,_:=request("POST","/api/v1/auth/logout","",cookie,"http://127.0.0.1:5173");n!=204 {t.Fatal("logout rejected")}
	if n,_,_:=request("GET","/api/v1/auth/me","",cookie,"");n!=401 {t.Fatal("logged out session remains valid")}
	if n,_,_:=request("GET","/api/v1/auth/me","",fresh,"");n!=200 {t.Fatal("other session invalidated")}
	if n,_,_:=request("POST","/api/v1/auth/logout","",fresh,"http://127.0.0.1:5173");n!=204 {t.Fatal("second logout rejected")}
}
