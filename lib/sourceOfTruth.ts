import fs from 'node:fs';
import path from 'node:path';
import { bestFuzzyMatch, normalize } from './fuzzyMatch';

export interface Investor { id: string; externalId?: string; name: string }
export interface Fund { id: string; externalId?: string; name: string; aliases: string[] }
export interface Account { id: string; externalId?: string; investorId: string; accountName: string }

interface SourceOfTruth {
  investors: Investor[];
  funds: Fund[];
  accounts: Account[];
}

interface RawInvestor { id: string; externalId?: string; name: string }
interface RawFund {
  id: string;
  externalId?: string;
  name: { legal?: string; marketing?: string; short?: string } | string;
}
interface RawAccount {
  id: string;
  externalId?: string;
  investor: string;
  investorName?: string;
  name?: string;
}

let cached: SourceOfTruth | null = null;

function load(): SourceOfTruth {
  if (cached) return cached;
  const dir = path.join(process.cwd(), 'data');
  const rawInvestors: RawInvestor[] = JSON.parse(fs.readFileSync(path.join(dir, 'investors.json'), 'utf8'));
  const rawFunds: RawFund[] = JSON.parse(fs.readFileSync(path.join(dir, 'funds.json'), 'utf8'));
  const rawAccounts: RawAccount[] = JSON.parse(fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8'));

  const investors: Investor[] = rawInvestors.map((i) => ({
    id: i.id,
    externalId: i.externalId,
    name: (i.name ?? '').trim(),
  }));

  const funds: Fund[] = rawFunds.map((f) => {
    const nameObj = typeof f.name === 'string' ? { legal: f.name } : f.name ?? {};
    const legal = nameObj.legal ?? nameObj.marketing ?? nameObj.short ?? '';
    const aliases = [nameObj.legal, nameObj.marketing, nameObj.short, f.externalId]
      .filter((s): s is string => Boolean(s) && s !== legal);
    return { id: f.id, externalId: f.externalId, name: legal, aliases };
  });

  const accounts: Account[] = rawAccounts.map((a) => ({
    id: a.id,
    externalId: a.externalId,
    investorId: a.investor,
    accountName: a.name ?? '',
  }));

  cached = { investors, funds, accounts };
  return cached;
}

export type ValidationStatus = 'matched' | 'not_found' | 'not_provided';

export interface RowValidation {
  investorName: ValidationStatus;
  investorId: ValidationStatus;
  fundName: ValidationStatus;
  accountName: ValidationStatus;
  /**
   * 'matched'      -> account belongs to the matched investor
   * 'mismatch'     -> investor matched, but the named account isn't theirs
   * 'partial'      -> investor matched but no account info to check
   * 'not_provided' -> insufficient input (no investor matched)
   */
  relationship: 'matched' | 'mismatch' | 'partial' | 'not_provided';
}

export interface ValidatedFields {
  investorName: string | null;
  investorId: string | null;
  fundName: string | null;
  accountName: string | null;
  investorExternalId: string | null;
  fundExternalId: string | null;
  accountExternalId: string | null;
  validation: RowValidation;
}

export interface RawFields {
  investorName: string | null;
  investorId: string | null;
  fundName: string | null;
  accountName: string | null;
}

/**
 * Resolve each extracted field against the master lists. Matched fields are
 * replaced with the canonical form; unmatched fields are blanked.
 *
 * - Investor: investorId may be (a) the master UUID, (b) an account.externalId
 *   like "1004", or (c) absent — we then fuzzy-match by name.
 * - Fund: fuzzy-matched against the legal name and any alias (marketing,
 *   short, externalId).
 * - Account: in the new schema accounts are owned by an investor (no fund
 *   link). The relationship check confirms the account belongs to the
 *   matched investor.
 */
export function validateExtractedFields(raw: RawFields): ValidatedFields {
  const sot = load();

  // --- Investor: try investorId as master UUID, then as account.externalId,
  //     then fall back to fuzzy name match.
  let matchedInvestor: Investor | null = null;
  if (raw.investorId) {
    const idNorm = normalize(raw.investorId);
    const directUuid = sot.investors.find((i) => normalize(i.id) === idNorm);
    if (directUuid) matchedInvestor = directUuid;
    if (!matchedInvestor) {
      const directExternal = sot.investors.find((i) => i.externalId && normalize(i.externalId) === idNorm);
      if (directExternal) matchedInvestor = directExternal;
    }
    if (!matchedInvestor) {
      const acc = sot.accounts.find((a) => a.externalId && normalize(a.externalId) === idNorm);
      if (acc) matchedInvestor = sot.investors.find((i) => i.id === acc.investorId) ?? null;
    }
  }
  if (!matchedInvestor && raw.investorName) {
    matchedInvestor = bestFuzzyMatch(raw.investorName, sot.investors);
  }

  // --- Fund: build a flat (name, fund) pool that includes aliases.
  let matchedFund: Fund | null = null;
  if (raw.fundName) {
    const pool: { name: string; fund: Fund }[] = [];
    for (const f of sot.funds) {
      pool.push({ name: f.name, fund: f });
      for (const alias of f.aliases) pool.push({ name: alias, fund: f });
    }
    const hit = bestFuzzyMatch(raw.fundName, pool);
    matchedFund = hit ? hit.fund : null;
  }

  // --- Account: must belong to matched investor (no fund link in this schema).
  let matchedAccount: Account | null = null;
  let relationship: RowValidation['relationship'];
  if (!matchedInvestor) {
    relationship = 'not_provided';
  } else {
    const candidates = sot.accounts.filter((a) => a.investorId === matchedInvestor!.id);
    if (raw.accountName) {
      const named = bestFuzzyMatch(
        raw.accountName,
        candidates.map((c) => ({ name: c.accountName, account: c }))
      );
      if (named) matchedAccount = named.account;
      relationship = matchedAccount ? 'matched' : 'mismatch';
    } else if (candidates.length === 1) {
      matchedAccount = candidates[0];
      relationship = 'matched';
    } else {
      relationship = 'partial';
    }
  }

  const status = (rawValue: string | null, matched: boolean): ValidationStatus => {
    if (!rawValue) return 'not_provided';
    return matched ? 'matched' : 'not_found';
  };

  return {
    investorName: matchedInvestor ? matchedInvestor.name : null,
    investorId: matchedInvestor ? matchedInvestor.id : null,
    fundName: matchedFund ? matchedFund.name : null,
    accountName: matchedAccount ? matchedAccount.accountName : null,
    investorExternalId: matchedInvestor?.externalId ?? null,
    fundExternalId: matchedFund?.externalId ?? null,
    accountExternalId: matchedAccount?.externalId ?? null,
    validation: {
      investorName: status(raw.investorName, !!matchedInvestor),
      investorId: status(raw.investorId, !!matchedInvestor),
      fundName: status(raw.fundName, !!matchedFund),
      accountName: status(raw.accountName, !!matchedAccount),
      relationship,
    },
  };
}
