import { describe, expect, it } from "vitest";

import { normaliseOptionalName, normalisePersonName } from "./names";

describe("normalisePersonName", () => {
  it("capitalises every word however it was typed", () => {
    expect(normalisePersonName("ali valiv")).toBe("Ali Valiv");
    expect(normalisePersonName("ALI VALIV")).toBe("Ali Valiv");
    expect(normalisePersonName("aLi vAlIv")).toBe("Ali Valiv");
  });

  it("trims and collapses the spacing a hurried desk leaves behind", () => {
    expect(normalisePersonName("  ali   valiv ")).toBe("Ali Valiv");
  });

  // The apostrophe is part of the letter o', not a word break, so it must not
  // start a new capital the way a hyphen does.
  it("keeps o' and g' as single letters", () => {
    expect(normalisePersonName("o'ktam g'ulomov")).toBe("O'ktam G'ulomov");
  });

  it("capitalises across a hyphen", () => {
    expect(normalisePersonName("abdulla-aziz karimov")).toBe(
      "Abdulla-Aziz Karimov",
    );
  });

  it("leaves a single name alone but for its case", () => {
    expect(normalisePersonName("dilnoza")).toBe("Dilnoza");
  });

  it("returns an empty string for nothing but whitespace", () => {
    expect(normalisePersonName("   ")).toBe("");
  });
});

describe("normaliseOptionalName", () => {
  it("turns a blank surname into null rather than an empty string", () => {
    expect(normaliseOptionalName("  ")).toBeNull();
    expect(normaliseOptionalName(null)).toBeNull();
    expect(normaliseOptionalName(undefined)).toBeNull();
  });

  it("normalises a surname that is actually there", () => {
    expect(normaliseOptionalName("valiv")).toBe("Valiv");
  });
});

/*
 * The member list the gym imported from carries a bracketed note inside the
 * name - "(DOM)", "(YANGI)", "(kiyov bola dusti)" - which is how the desk
 * tells two people with the same name apart. It has to case like a word.
 */
describe("normalisePersonName, bracketed notes", () => {
  it("capitalises inside brackets", () => {
    expect(normalisePersonName("KARIMOV ULUGBEK (DOM)")).toBe(
      "Karimov Ulugbek (Dom)",
    );
  });

  it("capitalises after a bracket with no space before it", () => {
    expect(normalisePersonName("QURBONOV ISLOM(AKA UKA)")).toBe(
      "Qurbonov Islom(Aka Uka)",
    );
  });

  it("still keeps o' and g' as single letters", () => {
    expect(normalisePersonName("G'ULOMOV O'KTAM")).toBe("G'ulomov O'ktam");
  });
});
