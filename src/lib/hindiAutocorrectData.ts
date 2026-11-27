/**
 * Hindi auto-correct dictionary (curated seed list).
 * -------------------------------------------------
 * Consumed by useHindiReportAutocorrect through src/lib/hindiAutocorrect.ts.
 *
 * - `silent`    : replaced automatically as soon as the word is completed -
 *                 reserved for unambiguous misspellings.
 * - `suggested` : offered as a one-click suggestion instead, because both
 *                 spellings are seen in practice and the officer should choose.
 * - `off`       : kept on file for review but inactive.
 *
 * Lookup runs through normalizeHindi() so nukta variants (\u095C\u0924... / \u091C...)
 * and candrabindu/anusvara (\u0901/\u0902) collapse for MATCHING only - the
 * officer's own characters are never rewritten with the normalized form.
 *
 * NOTE: Every Devanagari literal below is written as a \uXXXX escape on
 * purpose: this file stays pure ASCII so no editing tool can corrupt it
 * (same convention as src/lib/gdSuggestions.ts).
 */

export type CorrectionLevel = "silent" | "suggested" | "off";

export interface HindiCorrectionEntry {
  wrong: string;
  right: string;
  level: CorrectionLevel;
  tags?: string[];
}

export const HINDI_CORRECTIONS: HindiCorrectionEntry[] = [
  { wrong: "\u0915\u0943\u092a\u094d\u092f\u093e", right: "\u0915\u0943\u092a\u092f\u093e", level: "silent", tags: ["common"] },
  { wrong: "\u0915\u093f\u091c\u093f\u090f", right: "\u0915\u0940\u091c\u093f\u090f", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0926\u093f\u091c\u093f\u090f", right: "\u0926\u0940\u091c\u093f\u090f", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0932\u093f\u091c\u093f\u090f", right: "\u0932\u0940\u091c\u093f\u090f", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0928\u0939\u0940", right: "\u0928\u0939\u0940\u0902", level: "silent", tags: ["common", "anusvara"] },
  { wrong: "\u0915\u094d\u092f\u094b\u0915\u093f", right: "\u0915\u094d\u092f\u094b\u0902\u0915\u093f", level: "silent", tags: ["common", "anusvara"] },
  { wrong: "\u0915\u094d\u092f\u094b\u0901\u0915\u093f", right: "\u0915\u094d\u092f\u094b\u0902\u0915\u093f", level: "silent", tags: ["common", "candrabindu"] },
  { wrong: "\u0915\u094b\u0907", right: "\u0915\u094b\u0908", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0917\u0907", right: "\u0917\u0908", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0930\u0939\u093f", right: "\u0930\u0939\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0939\u0941\u0907", right: "\u0939\u0941\u0908", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u091c\u0932\u094d\u0926\u093f", right: "\u091c\u0932\u094d\u0926\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0906\u0938\u093e\u0928\u093f", right: "\u0906\u0938\u093e\u0928\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0916\u0941\u0936\u093f", right: "\u0916\u0941\u0936\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u092a\u094d\u0930\u093e\u0930\u0941\u092a", right: "\u092a\u094d\u0930\u093e\u0930\u0942\u092a", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0938\u094d\u0935\u093f\u0915\u0943\u0924\u093f", right: "\u0938\u094d\u0935\u0940\u0915\u0943\u0924\u093f", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0938\u094d\u0935\u093f\u0915\u093e\u0930", right: "\u0938\u094d\u0935\u0940\u0915\u093e\u0930", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0928\u093f\u0930\u093f\u0915\u094d\u0937\u0923", right: "\u0928\u093f\u0930\u0940\u0915\u094d\u0937\u0923", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u091a\u093f\u091f\u094d\u0920\u093f", right: "\u091a\u093f\u091f\u094d\u0920\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0924\u0924\u094d\u0915\u093e\u0932\u093f\u0928", right: "\u0924\u0924\u094d\u0915\u093e\u0932\u0940\u0928", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0938\u0902\u092c\u0902\u0927\u093f", right: "\u0938\u0902\u092c\u0902\u0927\u0940", level: "silent", tags: ["common", "matra"] },
  { wrong: "\u0935\u093f\u0935\u0947\u091a\u0923\u093e", right: "\u0935\u093f\u0935\u0947\u091a\u0928\u093e", level: "silent", tags: ["police"] },
  { wrong: "\u0924\u0932\u093e\u0938\u0940", right: "\u0924\u0932\u093e\u0936\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0924\u0932\u093e\u0936\u093f", right: "\u0924\u0932\u093e\u0936\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0906\u0930\u094b\u092a\u093f", right: "\u0906\u0930\u094b\u092a\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u092a\u094d\u0930\u093e\u0930\u094d\u0925\u093f", right: "\u092a\u094d\u0930\u093e\u0930\u094d\u0925\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u092a\u0930\u093f\u0935\u093e\u0926\u093f", right: "\u092a\u0930\u093f\u0935\u093e\u0926\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0917\u0935\u093e\u0939\u093f", right: "\u0917\u0935\u093e\u0939\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0938\u093e\u0915\u094d\u0937\u093f", right: "\u0938\u093e\u0915\u094d\u0937\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0905\u0927\u093f\u0915\u093e\u0930\u093f", right: "\u0905\u0927\u093f\u0915\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0915\u0930\u094d\u092e\u091a\u093e\u0930\u093f", right: "\u0915\u0930\u094d\u092e\u091a\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0917\u093e\u0921\u093c\u093f", right: "\u0917\u093e\u0921\u093c\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u091a\u094c\u0915\u093f", right: "\u091a\u094c\u0915\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0930\u093f\u092a\u094b\u0930\u094d\u0924", right: "\u0930\u093f\u092a\u094b\u0930\u094d\u091f", level: "silent", tags: ["police"] },
  { wrong: "\u091c\u092e\u094d\u092e\u093e\u0928\u0924", right: "\u091c\u092e\u093e\u0928\u0924", level: "silent", tags: ["police"] },
  { wrong: "\u0930\u093f\u0939\u093e\u0907", right: "\u0930\u093f\u0939\u093e\u0908", level: "silent", tags: ["police"] },
  { wrong: "\u0924\u0948\u0928\u093e\u0924\u093f", right: "\u0924\u0948\u0928\u093e\u0924\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0915\u093e\u0930\u094d\u092f\u0935\u093e\u0939\u093f", right: "\u0915\u093e\u0930\u094d\u092f\u0935\u093e\u0939\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u091b\u0941\u091f\u094d\u091f\u093f", right: "\u091b\u0941\u091f\u094d\u091f\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u091c\u093e\u0928\u0915\u093e\u0930\u093f", right: "\u091c\u093e\u0928\u0915\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0938\u0941\u0928\u0935\u093e\u0907", right: "\u0938\u0941\u0928\u0935\u093e\u0908", level: "silent", tags: ["police"] },
  { wrong: "\u0905\u0930\u094d\u091c\u093f", right: "\u0905\u0930\u094d\u091c\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u092a\u0947\u0936\u093f", right: "\u092a\u0947\u0936\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0935\u0938\u0942\u0932\u093f", right: "\u0935\u0938\u0942\u0932\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u091c\u093f\u0932\u093e\u0927\u093f\u0915\u093e\u0930\u093f", right: "\u091c\u093f\u0932\u093e\u0927\u093f\u0915\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0905\u0927\u094b\u0939\u0938\u094d\u0924\u093e\u0915\u094d\u0937\u0930\u093f", right: "\u0905\u0927\u094b\u0939\u0938\u094d\u0924\u093e\u0915\u094d\u0937\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u092a\u0924\u094d\u0930\u093e\u0935\u0932\u093f", right: "\u092a\u0924\u094d\u0930\u093e\u0935\u0932\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u092a\u094d\u0930\u092d\u093e\u0930\u093f", right: "\u092a\u094d\u0930\u092d\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0921\u093e\u092f\u0930\u093f", right: "\u0921\u093e\u092f\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0905\u0938\u093e\u092e\u093f", right: "\u0905\u0938\u093e\u092e\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0909\u0924\u094d\u0924\u0930\u0926\u093e\u092f\u093f", right: "\u0909\u0924\u094d\u0924\u0930\u0926\u093e\u092f\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u091c\u093f\u092e\u094d\u092e\u0947\u0926\u093e\u0930\u093f", right: "\u091c\u093f\u092e\u094d\u092e\u0947\u0926\u093e\u0930\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0905\u0928\u0941\u0938\u0942\u091a\u093f", right: "\u0905\u0928\u0941\u0938\u0942\u091a\u0940", level: "silent", tags: ["police"] },
  { wrong: "\u0915\u0930\u093f\u092f\u0947", right: "\u0915\u0930\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u091c\u093e\u0907\u092f\u0947", right: "\u091c\u093e\u0907\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0926\u093f\u092f\u0947", right: "\u0926\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0932\u093f\u092f\u0947", right: "\u0932\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0917\u092f\u0947", right: "\u0917\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0915\u0940\u091c\u093f\u092f\u0947", right: "\u0915\u0940\u091c\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0926\u0940\u091c\u093f\u092f\u0947", right: "\u0926\u0940\u091c\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0932\u0940\u091c\u093f\u092f\u0947", right: "\u0932\u0940\u091c\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0938\u094b\u091a\u093f\u092f\u0947", right: "\u0938\u094b\u091a\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0926\u0947\u0916\u093f\u092f\u0947", right: "\u0926\u0947\u0916\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u092c\u0924\u093e\u0908\u092f\u0947", right: "\u092c\u0924\u093e\u0907\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u092d\u0947\u091c\u093f\u092f\u0947", right: "\u092d\u0947\u091c\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u092a\u093e\u0907\u092f\u0947", right: "\u092a\u093e\u0907\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0932\u093e\u0907\u092f\u0947", right: "\u0932\u093e\u0907\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0932\u093f\u0916\u093f\u092f\u0947", right: "\u0932\u093f\u0916\u093f\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0915\u0930\u0935\u093e\u092f\u0947", right: "\u0915\u0930\u0935\u093e\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u092c\u0924\u093e\u092f\u0947", right: "\u092c\u0924\u093e\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0915\u0930\u093e\u092f\u0947", right: "\u0915\u0930\u093e\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u092c\u0941\u0932\u093e\u092f\u0947", right: "\u092c\u0941\u0932\u093e\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u0938\u0941\u0928\u093e\u092f\u0947", right: "\u0938\u0941\u0928\u093e\u090f", level: "suggested", tags: ["style"] },
  { wrong: "\u091c\u093e\u092f\u0947\u0917\u093e", right: "\u091c\u093e\u090f\u0917\u093e", level: "suggested", tags: ["style"] },
];
