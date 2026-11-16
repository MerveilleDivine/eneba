package purchase

import (
	"context"
	"errors"

	"github.com/MerveilleDivine/eneba/api/internal/database"
	"github.com/jackc/pgx/v5"
)

func (r *Repository) ListOrders(ctx context.Context, buyerID string, pagination orderPagination) (OrderPage, error) {
	page := OrderPage{Items: []OrderSummary{}, Page: pagination.page, PageSize: pagination.size}
	// One snapshot keeps the count and page consistent if another checkout commits.
	tx, err := r.pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return page, database.ClassifyReadError(err)
	}
	defer tx.Rollback(ctx)
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM marketplace.orders WHERE user_id=$1::uuid`, buyerID).Scan(&page.Total); err != nil {
		return page, database.ClassifyReadError(err)
	}
	rows, err := tx.Query(ctx, `SELECT o.id::text,o.created_at,o.total_cents,count(i.id)
	 FROM marketplace.orders o JOIN marketplace.order_items i ON i.order_id=o.id
	 WHERE o.user_id=$1::uuid GROUP BY o.id
	 ORDER BY o.created_at DESC,o.id DESC LIMIT $2 OFFSET $3`, buyerID, pagination.size, pagination.offset)
	if err != nil {
		return page, database.ClassifyReadError(err)
	}
	defer rows.Close()
	for rows.Next() {
		item := OrderSummary{Currency: "EUR"}
		if err = rows.Scan(&item.ID, &item.CreatedAt, &item.TotalCents, &item.ItemCount); err != nil {
			return page, database.ClassifyReadError(err)
		}
		if !priceSafe(item.TotalCents) {
			return page, errors.New("invalid stored order total")
		}
		page.Items = append(page.Items, item)
	}
	if err = rows.Err(); err != nil {
		return page, database.ClassifyReadError(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return page, database.ClassifyReadError(err)
	}
	return page, nil
}

func (r *Repository) ReadOrder(ctx context.Context, buyerID, orderID string) (OrderDetail, error) {
	order := OrderDetail{Currency: "EUR", Items: []OrderItem{}}
	// Ownership is part of this query, before any key leaves PostgreSQL. Never
	// fetch an order first and authorize it afterward. Historical delivery uses
	// its allocated key and receipt snapshots, not today's active offers/prices.
	rows, err := r.pool.Query(ctx, `SELECT o.id::text,o.created_at,o.total_cents,
	 i.id::text,i.product_name_snapshot,i.seller_name_snapshot,i.unit_price_cents,k.demo_code
	 FROM marketplace.orders o JOIN marketplace.order_items i ON i.order_id=o.id
	 JOIN marketplace.digital_keys k ON k.id=i.digital_key_id AND k.offer_id=i.offer_id
	 WHERE o.id=$1::uuid AND o.user_id=$2::uuid ORDER BY i.id`, orderID, buyerID)
	if err != nil {
		return order, database.ClassifyReadError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var item OrderItem
		if err = rows.Scan(&order.ID, &order.CreatedAt, &order.TotalCents, &item.ID, &item.ProductName, &item.SellerName, &item.UnitPriceCents, &item.KeyCode); err != nil {
			return order, database.ClassifyReadError(err)
		}
		if !priceSafe(order.TotalCents) || !priceSafe(item.UnitPriceCents) {
			return OrderDetail{}, errors.New("invalid stored order price")
		}
		order.Items = append(order.Items, item)
	}
	if err = rows.Err(); err != nil {
		return OrderDetail{}, database.ClassifyReadError(err)
	}
	if order.ID == "" {
		return OrderDetail{}, ErrOrderNotFound
	}
	return order, nil
}
