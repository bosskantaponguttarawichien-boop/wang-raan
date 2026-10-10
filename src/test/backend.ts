/**
 * Backend จำลองสำหรับเทสต์ฝั่ง BFF (feat-039) — ทุกคำขอของ BFF ผ่านตัวตรวจสัญญา
 * ใช้: `const be = testBackend(); ... afterEach(() => expect(be.violations).toEqual([]))`
 */
import { contractFetch } from "../../contracts/contract-checker";
import { createMockBackend } from "../../mock-backend/handler";
import { createRemoteLayoutRepository } from "@/server/layout-repository";
import { createRemoteShareRepository } from "@/server/share-repository";
import { createBackendClient } from "@/server/token-relay";

export const TEST_BACKEND_SECRET = "bff-test-internal-secret";

export function testBackend(options: { now?: () => Date; newShareKey?: () => string } = {}) {
  const mock = createMockBackend({ secret: TEST_BACKEND_SECRET, ...options });
  const checked = contractFetch(mock.fetch);
  const client = createBackendClient({ baseUrl: "http://backend.test", secret: TEST_BACKEND_SECRET, fetch: checked.fetch, retryDelayMs: 0 });
  return {
    mock,
    client,
    violations: checked.violations,
    layouts: createRemoteLayoutRepository(client),
    shares: createRemoteShareRepository(client),
  };
}
