import { buildApp } from "../src/app";
import fs from "fs";

const app = buildApp({ testUser: { sub: "test", email: "test@test.com" } });

app.ready().then(() => {
  const schema = app.swagger();
  fs.writeFileSync("./openapi.json", JSON.stringify(schema, null, 2));
  console.log("OpenAPI schema exported to openapi.json");
  process.exit(0);
});
