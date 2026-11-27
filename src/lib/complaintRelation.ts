import type { ComplaintItem, RelativeRelation } from '@/types';

export function formatComplaintRelative(
  complaint: Pick<ComplaintItem, 'complainantRelationType' | 'complainantRelativeName' | 'complainantFatherSpouse'>,
): string {
  const relative = complaint.complainantRelativeName?.trim() || complaint.complainantFatherSpouse?.trim();
  if (!relative) return '';

  return [complaint.complainantRelationType, relative].filter(Boolean).join(' ');
}

/**
 * CMP-05 fix: never hardcode "S/o" for every complainant. When the stored
 * relation type is missing, fall back by gender (W/o for female, S/o for male)
 * and return an empty prefix when the gender is unknown, so a female
 * complainant is never mislabeled with a father/husband marker of the wrong
 * kind.
 */
export function relativePrefix(
  relationType?: string | null,
  gender?: string | null,
): string {
  const stored = relationType?.trim();
  if (stored) return stored;
  const normalized = (gender || '').trim().toUpperCase();
  if (normalized === 'FEMALE' || normalized === 'W/O') return 'W/o';
  if (normalized === 'MALE' || normalized === 'S/O') return 'S/o';
  return '';
}

/**
 * Formats "(W/o Krishan Lal)"-style relation text from a stored relation type,
 * a relative name and an optional gender fallback. Returns '' when there is no
 * relative name.
 */
export function formatRelativeWithType(
  relationType?: string | null,
  relativeName?: string | null,
  gender?: string | null,
): string {
  const relative = relativeName?.trim();
  if (!relative) return '';
  const prefix = relativePrefix(relationType, gender);
  return prefix ? `${prefix} ${relative}` : relative;
}

export function complaintRelationFromSource(source: string, name: string): { type?: RelativeRelation; relative: string } {
  const subject = name.trim().split(/\s+/).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
  if (!subject) return { relative: '' };
  const pattern = new RegExp(
    '(?<![\\p{L}\\p{M}])' + subject + '\\s*[,;:]?\\s*(पुत्री|पुत्र|पत्नी|s\\s*[/ .]\\s*o|d\\s*[/ .]\\s*o|w\\s*[/ .]\\s*o|c\\s*[/ .]\\s*o|son of|daughter of|wife of|care of)(?![\\p{L}\\p{M}])\\s*[:.-]?\\s*([^\\n,।;]+)',
    'giu',
  );
  const matches = [...source.matchAll(pattern)].map(([, marker, value]) => {
    const key = marker.toLowerCase().replace(/[\s/.]/g, '');
    const type: RelativeRelation = /^(पत्नी|wo|wifeof)$/.test(key) ? 'W/O' :
      /^(पुत्री|do|daughterof)$/.test(key) ? 'D/O' : /^(co|careof)$/.test(key) ? 'C/O' : 'S/O';
    return { type, relative: value.split(/\s+(?:निवासी|रहने वाली|रहने वाला|r\s*\/\s*o|मो[०0.]|मोबाइल)/iu)[0].trim() };
  }).filter(match => match.relative);
  const first = matches[0];
  return first && matches.every(match => match.type === first.type && match.relative === first.relative) ? first : { relative: '' };
}
