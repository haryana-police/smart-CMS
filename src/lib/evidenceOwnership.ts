import type {UniversalEvidenceRecord} from '@/types/evidence';

/**
 * Resolves the owning account of an evidence record. The legacy name-matching
 * fallback against hardcoded demo personas was removed with the demo accounts;
 * records uploaded before per-user ownership must be re-attributed explicitly
 * through Account Master if needed.
 */
export function evidenceOwner(record:UniversalEvidenceRecord):string | undefined {
 return record.ownerId;
}
