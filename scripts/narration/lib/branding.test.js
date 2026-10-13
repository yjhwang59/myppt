import test from "node:test";
import assert from "node:assert/strict";
import { normalizeBrand, brandRole } from "./branding.js";

test("shared role is exactly AI發展顧問", () => {
  assert.equal(brandRole(), "AI發展顧問");
});

test("normalizeBrand keeps the person name and replaces the title", () => {
  assert.equal(
    normalizeBrand("黃燕忠｜中國文化大學兼任副教授／上市公司 AI 發展顧問"),
    "黃燕忠｜AI發展顧問"
  );
  assert.equal(normalizeBrand("Jack Y. J. Hwang"), "Jack Y. J. Hwang｜AI發展顧問");
  assert.equal(normalizeBrand("Jack Y. J. Hwang · AIDC.work"), "Jack Y. J. Hwang｜AI發展顧問");
  assert.equal(normalizeBrand("企業 AI 整合平台"), "AI發展顧問");
  assert.equal(normalizeBrand("fyhGoogle"), "AI發展顧問");
  assert.equal(normalizeBrand(""), "AI發展顧問");
  assert.equal(
    normalizeBrand("口語：中文(English)；欄位以 code 為準"),
    "口語：中文(English)；欄位以 code 為準"
  );
});
