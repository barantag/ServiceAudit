// Run: node scripts/verify-finding-reviews.mjs [--database]
// --database requires the local Next.js app on REVIEW_TEST_URL (default localhost:3000).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

const root = fileURLToPath(new URL("../", import.meta.url));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const candidate = specifier.startsWith("@/")
      ? path.join(root, "src", specifier.slice(2))
      : specifier.startsWith(".") && context.parentURL?.endsWith(".ts")
        ? fileURLToPath(new URL(specifier, context.parentURL)) : null;
    if (candidate && existsSync(candidate + ".ts")) {
      return { url: pathToFileURL(candidate + ".ts").href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { detectRepeatedFailureFindings: repeated } = await import("../src/lib/findings/repeated-failure.ts");
const { detectDuplicateServiceFindings: duplicate } = await import("../src/lib/findings/duplicate-service.ts");
const { detectAbnormalPriceFindings: abnormal } = await import("../src/lib/findings/abnormal-price.ts");
const { detectWarrantyServiceFindings: warranty } = await import("../src/lib/findings/warranty-service.ts");
const { validateReviewInput, DEFAULT_REVIEW } = await import("../src/lib/findings/review-contract.ts");
let passed = 0;
function check(name, fn) { fn(); passed++; console.log("PASS " + name); }
const base = {
  id: randomUUID(), createdAt: new Date("2026-01-01T00:00:00Z"), assetCode: " ŞİŞLİ-1 ",
  assetType: "Pompa", failureType: "Motor", locationCode: "L1", locationName: "Merkez",
  vendorName: "Firma", serviceDate: "2026-01-01", amount: "1000.00", currency: "TRY",
  invoiceNumber: "F1", sourceFileName: "review-test.csv", sourceRowNumber: 2,
};
const later = { ...base, id: randomUUID(), serviceDate: "2026-01-11", sourceRowNumber: 3 };
const sameDay = { ...base, id: randomUUID(), createdAt: new Date("2026-01-01T01:00:00Z"), sourceRowNumber: 4 };
const prices = [1000,1100,1200,1700].map((amount,i) => ({
  ...base, id: randomUUID(), assetCode: "PRICE", serviceDate: `2026-0${i+1}-01`, amount: amount.toFixed(2), sourceRowNumber: i+5,
}));
const guarantee = { id: randomUUID(), assetCode: "sisli-1", locationCode: "L1",
  warrantyStartDate: "2026-01-01", warrantyEndDate: "2026-12-31",
  providerName: "Üretici", sourceFileName: "warranty-test.csv", sourceRowNumber: 2 };
const rep = repeated([base, later])[0];
const dup = duplicate([base, sameDay])[0];
const price = abnormal(prices)[0];
const warr = warranty([base], [guarantee])[0];
check("all four keys use source IDs and remain stable", () => {
  assert.equal(rep.findingKey, `repeated-failure:${base.id}:${later.id}`);
  assert.equal(dup.findingKey, `duplicate-service:${base.id}:${sameDay.id}`);
  assert.equal(price.findingKey, `abnormal-price:${prices[3].id}`);
  assert.equal(warr.findingKey, `warranty-service:${base.id}:${guarantee.id}`);
  assert.deepEqual(repeated([later,base]), repeated([base,later]));
  assert.deepEqual(duplicate([sameDay,base]), duplicate([base,sameDay]));
  assert.deepEqual(abnormal([...prices].reverse()), abnormal(prices));
  assert.deepEqual(warranty([base],[guarantee]), warranty([base],[guarantee]));
});
check("repeated rule retains interval/location/nearest behavior", () => {
  assert.equal(rep.daysBetween,10);
  assert.equal(repeated([base,{...later,serviceDate:"2026-02-01"}]).length,0);
  assert.equal(repeated([base,sameDay]).length,0);
  assert.equal(repeated([base,{...later,locationCode:"L2"}]).length,0);
  const third={...later,id:randomUUID(),serviceDate:"2026-01-20"};
  assert.equal(repeated([third,base,later])[1].previousRecordId,later.id);
});
check("duplicate rule retains invoice/details and currency behavior", () => {
  assert.equal(dup.reasonType,"sameInvoice");
  assert.equal(duplicate([base,{...sameDay,invoiceNumber:"F2"}])[0].reasonType,"sameServiceDetails");
  assert.equal(duplicate([base,{...sameDay,invoiceNumber:"F2",currency:"USD"}]).length,0);
  assert.equal(duplicate([base,later]).length,0);
});
check("price rule retains median/history threshold", () => {
  assert.equal(price.historicalMedian,"1100.00");
  assert.equal(price.historicalComparableRecordCount,3);
  assert.equal(abnormal([...prices.slice(0,3),{...prices[3],amount:"1500.00"}]).length,0);
  assert.equal(abnormal(prices.slice(1)).length,0);
});
check("warranty rule retains boundaries/positive amount/latest warranty", () => {
  assert.equal(warranty([{...base,serviceDate:"2026-12-31"}],[guarantee]).length,1);
  assert.equal(warranty([{...base,serviceDate:"2027-01-01"}],[guarantee]).length,0);
  assert.equal(warranty([{...base,amount:"0"}],[guarantee]).length,0);
  const newest={...guarantee,id:randomUUID(),warrantyStartDate:"2026-01-10"};
  assert.equal(warranty([later],[guarantee,newest])[0].warrantyRecordId,newest.id);
});
check("review input validation and default open", () => {
  assert.equal(DEFAULT_REVIEW.status,"open");
  assert.equal(validateReviewInput({findingKey:rep.findingKey,status:"admin"}).ok,false);
  assert.equal(validateReviewInput({findingKey:rep.findingKey,status:"open",note:"x".repeat(2001)}).ok,false);
  assert.equal(validateReviewInput({findingKey:rep.findingKey,status:"open",findingType:"fake"}).ok,false);
});
if (process.argv.includes("--database")) await databaseChecks();
console.log(`Completed ${passed} verification groups.`);

async function databaseChecks() {
  dotenv.config({ path:path.join(root,".env.local"), quiet:true });
  const organizationId=process.env.SERVICEAUDIT_ORGANIZATION_ID?.trim();
  assert.ok(organizationId);
  const client=new pg.Client({connectionString:process.env.DATABASE_URL});
  await client.connect();
  const url=process.env.REVIEW_TEST_URL || "http://localhost:3000";
  const token=randomUUID();
  const ownServices=[];
  const ownKeys=[];
  const otherOrg=randomUUID();
  const warrantyId=randomUUID();
  let otherCreated=false;
  async function post(body) {
    const r=await fetch(url+"/api/finding-reviews",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    return {status:r.status,body:await r.json()};
  }
  async function stored(key,org=organizationId) {
    return (await client.query("select * from finding_reviews where organization_id=$1 and finding_key=$2",[org,key])).rows;
  }
  try {
    assert.equal((await client.query("select to_regclass('public.finding_reviews') as name")).rows[0].name,"finding_reviews");
    const records=[base,later,sameDay,...prices].map(r=>({...r,
      assetCode:r.assetCode==="PRICE" ? "PRICE-"+token : "ASSET-"+token,
      vendorName:"VENDOR-"+token,
      sourceFileName:"review-"+token+".csv",
    }));
    for(const r of records){
      await client.query("insert into service_records (id,organization_id,asset_code,asset_type,failure_type,location_code,location_name,vendor_name,service_date,amount,currency,invoice_number,source_file_name,source_row_number,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",[
        r.id,organizationId,r.assetCode,r.assetType,r.failureType,r.locationCode,r.locationName,r.vendorName,r.serviceDate,r.amount,r.currency,r.invoiceNumber,r.sourceFileName,r.sourceRowNumber,r.createdAt
      ]);
      ownServices.push(r.id);
    }
    await client.query("insert into warranties (id,organization_id,asset_code,location_code,warranty_start_date,warranty_end_date,provider_name,source_file_name,source_row_number) values ($1,$2,$3,'L1','2026-01-01','2026-12-31','QA provider','qa-warranty.csv',2)",[warrantyId,organizationId,records[0].assetCode]);
    const actualRep=repeated(records)[0];
    const actualDup=duplicate(records)[0];
    const actualPrice=abnormal(records).find(f=>f.currentRecordId===prices[3].id);
    const actualWarranty=warranty(records,[{...guarantee,id:warrantyId,assetCode:records[0].assetCode}])[0];
    assert.ok(actualRep && actualDup && actualPrice && actualWarranty);
    const key=actualRep.findingKey;
    const examples=[actualRep,actualDup,actualPrice,actualWarranty];
    ownKeys.push(...examples.map(f=>f.findingKey));
    const list=await (await fetch(url+"/findings")).text();
    for(const f of examples){
      const row=(list.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)||[]).find(row=>row.includes(encodeURIComponent(f.findingKey)));
      assert.ok(row?.includes("İncelenecek"));
      const page=await fetch(url+"/findings/detail?key="+encodeURIComponent(f.findingKey)+"&evidence=FORGED_EVIDENCE");
      assert.equal(page.status,200);
      const html=await page.text();
      assert.ok(html.includes("Destekleyici kanıtlar"));
      assert.ok(html.includes("review-"+token+".csv"));
      // Only the server-created evidence section matters; Next may serialize query parameters.
      const section=html.match(/<section aria-labelledby="evidence-title"[\s\S]*?<\/section>/)?.[0];
      assert.ok(section && !section.includes("FORGED_EVIDENCE"));
    }
    passed++; console.log("PASS four detail evidence pages and default list states");
    const fake="abnormal-price:"+randomUUID();
    ownKeys.push(fake);
    for(const [input,status] of [
      [{findingKey:fake,status:"confirmed"},404],
      [{findingKey:key,status:"bogus"},400],
      [{findingKey:key,status:"confirmed",note:"x".repeat(2001)},400],
      [{findingKey:key,status:"open",findingType:"warranty-service"},400],
      [{findingKey:key,status:"open",organizationId:otherOrg},400],
    ]) assert.equal((await post(input)).status,status);
    assert.equal((await stored(fake)).length,0);
    assert.equal((await stored(key)).length,0);
    passed++; console.log("PASS fake key, status, note, injected type/org rejected without rows");

    await client.query("insert into organizations(id,name,slug) values($1,'Review QA',$2)",[otherOrg,"review-qa-"+token]);
    otherCreated=true;
    await client.query("insert into finding_reviews(organization_id,finding_key,finding_type,status,note) values($1,$2,'repeated-failure','dismissed','OTHER_ORG_UNCHANGED')",[otherOrg,key]);
    const expectedTypes=["repeated-failure","duplicate-service","abnormal-price","warranty-service"];
    for(let i=0;i<examples.length;i++){
      const r=await post({findingKey:examples[i].findingKey,status:"confirmed",note:"Persisted note "+i});
      assert.equal(r.status,200);
      assert.equal((await stored(examples[i].findingKey))[0].finding_type,expectedTypes[i]);
    }
    const row=(await stored(key))[0];
    assert.equal(row.status,"confirmed"); assert.ok(row.reviewed_at);
    const refreshed=await (await fetch(url+"/findings/detail?key="+encodeURIComponent(key))).text();
    assert.ok(refreshed.includes("Doğrulandı") && refreshed.includes("Persisted note 0"));
    const refreshedList=await (await fetch(url+"/findings")).text();
    const confirmedRow=(refreshedList.match(/<tr[^>]*>[\s\S]*?<\/tr>/g)||[]).find(row=>row.includes(encodeURIComponent(key)));
    assert.ok(confirmedRow?.includes("Doğrulandı"));
    const originalId=row.id;
    assert.equal((await post({findingKey:key,status:"dismissed",note:"Dismissed note"})).status,200);
    assert.equal((await stored(key))[0].status,"dismissed");
    assert.ok((await stored(key))[0].reviewed_at);
    assert.equal((await post({findingKey:key,status:"open",note:"Reopened"})).status,200);
    const reopened=(await stored(key))[0];
    assert.equal(reopened.status,"open"); assert.equal(reopened.reviewed_at,null);
    assert.equal(reopened.id,originalId); assert.equal((await stored(key)).length,1);
    assert.equal((await stored(actualDup.findingKey))[0].status,"confirmed");
    assert.equal((await stored(key,otherOrg))[0].note,"OTHER_ORG_UNCHANGED");
    passed++; console.log("PASS upsert, refresh, transitions, other findings and other organization unchanged");
    await assert.rejects(client.query("insert into finding_reviews(organization_id,finding_key,finding_type) values($1,$2,'repeated-failure')",[organizationId,key]),error=>error.code==="23505");
    const foreignService=randomUUID();
    await client.query("insert into service_records(id,organization_id,service_date,asset_code,amount) values($1,$2,'2026-01-11',$3,100)",[foreignService,otherOrg,"ASSET-"+token]);
    const foreignKey="repeated-failure:"+base.id+":"+foreignService;
    assert.equal((await post({findingKey:foreignKey,status:"confirmed"})).status,404);
    assert.equal((await stored(foreignKey)).length,0);
    await client.query("insert into finding_reviews(organization_id,finding_key,finding_type,status) values($1,$2,'abnormal-price','confirmed')",[organizationId,fake]);
    const staleList=await (await fetch(url+"/findings")).text();
    assert.ok(!staleList.includes(encodeURIComponent(fake)));
    assert.equal((await fetch(url+"/findings/detail?key="+encodeURIComponent(fake))).status,404);
    assert.equal((await stored(fake)).length,1);
    passed++; console.log("PASS unique protection, cross-organization sources rejected, stale reviews retained without phantom findings");
  } finally {
    await client.query("delete from finding_reviews where organization_id=$1 and finding_key=any($2::varchar[])",[organizationId,ownKeys]);
    await client.query("delete from warranties where id=$1 and organization_id=$2",[warrantyId,organizationId]);
    await client.query("delete from service_records where organization_id=$1 and id=any($2::uuid[])",[organizationId,ownServices]);
    if(otherCreated) await client.query("delete from organizations where id=$1",[otherOrg]);
    await client.end();
    console.log("Temporary DB fixtures removed.");
  }
}
