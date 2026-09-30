import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("file store readers retain staff permissions while a new snapshot is being written", async t => {
  const dir = await fs.promises.mkdtemp(join(tmpdir(), "cashalot-store-"));
  const storePath = join(dir, "store.json");
  process.env.STORE_PATH = storePath;
  delete process.env.DATABASE_URL;
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const { readStore, mutateStore } = await import("../server/src/store.ts");
  await mutateStore(s => { s.config.adminTgIds = [800]; });

  let entered!: () => void;
  let release!: () => void;
  const writing = new Promise<void>(resolve => { entered = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const originalWrite = fs.promises.writeFile.bind(fs.promises);
  let intercepted = false;
  t.mock.method(fs.promises, "writeFile", async (file: any, data: any, options: any) => {
    if (!intercepted && String(file).startsWith(storePath)) {
      intercepted = true;
      await originalWrite(file, "", options);
      entered();
      await released;
    }
    return originalWrite(file, data, options);
  });
  const mutation = mutateStore(s => { s.config.adminUsername = "updated"; });
  await writing;
  try {
    const during = await readStore();
    assert.deepEqual(during.config.adminTgIds, [800]);
    assert.notEqual(during.config.adminUsername, "updated");
  } finally {
    release();
    await mutation;
  }
  const after = await readStore();
  assert.deepEqual(after.config.adminTgIds, [800]);
  assert.equal(after.config.adminUsername, "updated");
});
