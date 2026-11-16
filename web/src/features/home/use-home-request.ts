import { useReadRequest } from "../../shared/api/use-read-request";
import { HomeRequestError, type HomeFailure } from "./home-request";
function failure(error: unknown): HomeFailure {
  return error instanceof HomeRequestError ? error.kind : "unexpected";
}
export function useHomeRequest<T>(read: (signal: AbortSignal) => Promise<T>) {
  return useReadRequest({ read, failure, timeout: "timeout" as HomeFailure });
}
