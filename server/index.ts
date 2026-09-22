import { createDatabase } from "./db/database.ts";
import { seedAll } from "./seed.ts";
import { createServer } from "./http.ts";

const PORT = Number(process.env.PORT ?? 8787);

const db = await createDatabase();
seedAll(db);
createServer(db).listen(PORT, "127.0.0.1", () => {
  console.log(`MyPortfolio 本地服务已启动：http://127.0.0.1:${PORT}`);
});
