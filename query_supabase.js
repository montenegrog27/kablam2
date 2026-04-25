const https = require("https");

const serviceKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp2Zm1ncmN2bG5wdnZ5dnlidXhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU0NDU2MCwiZXhwIjoyMDg3MTIwNTYwfQ.gMg5v2ZUym7bJxRLfRMpxuW-FmTDxf5Yz1kW9IBiGkg";

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "zvfmgrcvlnpvvyvybuxc.supabase.co",
      path: path,
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(JSON.parse(data)));
    });
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  console.log("=== Query 1: Products with CHEESE ===");
  const q1 = await makeRequest(
    "/rest/v1/products?name=ilike.*CHEESE*&select=id,name,price&limit=5",
  );
  console.log(JSON.stringify(q1, null, 2));

  console.log("\n=== Query 2: All combos with price ===");
  const q2 = await makeRequest("/rest/v1/combos?select=id,name,price&limit=20");
  console.log(JSON.stringify(q2, null, 2));

  console.log("\n=== Query 3: combo_products (simple) ===");
  const q3 = await makeRequest(
    "/rest/v1/combo_products?select=combo_id,product_id&limit=10",
  );
  console.log(JSON.stringify(q3, null, 2));

  console.log("\n=== Query 3b: combo_products with product name ===");
  const q3b = await makeRequest(
    "/rest/v1/combo_products?select=combo_id,combos(name),products(name)&limit=10",
  );
  console.log(JSON.stringify(q3b, null, 2));
}

main().catch(console.error);
