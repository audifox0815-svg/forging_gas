/* eslint-disable @typescript-eslint/no-require-imports */

const path = require("path");
const XLSX = require("xlsx");

const outDir = process.cwd();

const productionRows = [
  { "년월": "2027-01", "라인": "P5", "제품": "금형강", "재질": "SCM440", "생산량": 120.5, "가동시간": 14.2, "목표량": 130 },
  { "년월": "2027-01", "라인": "P8", "제품": "크랭크축", "재질": "SCM420", "생산량": 98.0, "가동시간": 10.5, "목표량": 110 },
  { "년월": "2027-01", "라인": "P15", "제품": "쉘", "재질": "S45C", "생산량": 210.0, "가동시간": 22.0, "목표량": 220 },
  { "년월": "2027-01", "라인": "RM", "제품": "로터", "재질": "FC25", "생산량": 75.0, "가동시간": 8.0, "목표량": 80 },
];

const gasRows = [
  { "년월": "2027-01", "호기": 1, "라인": "P5", "사용량": 12000, "기준": "고지" },
  { "년월": "2027-01", "호기": 6, "라인": "P15", "사용량": 25000, "기준": "자체" },
  { "년월": "2027-01", "호기": 14, "라인": "P8", "사용량": 15000, "기준": "고지" },
  { "년월": "2027-01", "호기": 7, "라인": "RM", "사용량": 18000, "기준": "자체" },
  { "년월": "2027-01", "호기": 16, "라인": "P15", "사용량": 14000, "기준": "자체" },
];

for (const [fileName, sheetName, rows] of [
  ["sample-production.xlsx", "production", productionRows],
  ["sample-gas.xlsx", "gas", gasRows],
]) {
  const sheet = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const filePath = path.join(outDir, fileName);
  XLSX.writeFile(workbook, filePath, { bookType: "xlsx" });
  console.log(filePath);
}
