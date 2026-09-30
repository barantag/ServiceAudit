import type { RepeatedFailureFinding } from "./repeated-failure";
import type { DuplicateServiceFinding } from "./duplicate-service";
import type { AbnormalPriceFinding } from "./abnormal-price";
import type { WarrantyServiceFinding } from "./warranty-service";

export type CurrentFinding =
  | { type: "repeated-failure"; finding: RepeatedFailureFinding }
  | { type: "duplicate-service"; finding: DuplicateServiceFinding }
  | { type: "abnormal-price"; finding: AbnormalPriceFinding }
  | { type: "warranty-service"; finding: WarrantyServiceFinding };

export const FINDING_TYPE_LABELS = {
  "repeated-failure": "Tekrarlayan Arıza",
  "duplicate-service": "Mükerrer Servis Kaydı Adayı",
  "abnormal-price": "Anormal Servis Fiyatı",
  "warranty-service": "Garanti Süresinde Ücretli Servis",
} satisfies Record<CurrentFinding["type"], string>;
