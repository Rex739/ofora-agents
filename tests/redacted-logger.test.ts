import assert from "node:assert/strict";
import test from "node:test";
import { redactValue } from "@/lib/croo/redacted-logger";

test("redacts SDK keys in websocket URLs and nested objects", () => {
  const redacted = redactValue({
    url: "wss://api.croo.network/ws?key=croo_sk_secret123",
    headers: {
      "X-SDK-Key": "croo_sk_headersecret",
      Authorization: "Bearer croo_sk_authsecret"
    },
    nested: ["croo_sk_arraysecret"]
  });

  assert.deepEqual(redacted, {
    url: "wss://api.croo.network/ws?key=[REDACTED]",
    headers: {
      "X-SDK-Key": "[REDACTED]",
      Authorization: "[REDACTED]"
    },
    nested: ["[REDACTED]"]
  });
});
