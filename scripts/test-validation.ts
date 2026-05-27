/* eslint-disable no-console */
import { validateExtractedFields } from '../lib/sourceOfTruth';

const cases = [
  {
    label: '1) all valid (canonical names)',
    input: {
      investorName: 'New York Pension Fund',
      investorId: '381176b7-baa0-4abb-9a61-e78b8bf03780',
      fundName: 'Keystone Capital Fund I',
      accountName: 'default',
    },
  },
  {
    label: '2) typos / casing — should still match',
    input: {
      investorName: 'new york pension',
      investorId: null,
      fundName: 'keystone capital fund 1',
      accountName: 'Default',
    },
  },
  {
    label: '3) investorId is an account externalId (e.g. "1004") — should resolve to investor',
    input: { investorName: null, investorId: '1004', fundName: null, accountName: null },
  },
  {
    label: '4) fund matched by externalId alias "KC003"',
    input: { investorName: 'Howard Endowment', investorId: null, fundName: 'KC003', accountName: null },
  },
  {
    label: '5) bogus investor → blank',
    input: { investorName: 'Definitely Not Real Investor', investorId: 'XX-9999', fundName: 'Keystone Capital Fund I', accountName: 'default' },
  },
  {
    label: '6) bogus fund → blank fund only',
    input: { investorName: 'Liberty Insurance', investorId: null, fundName: 'Made Up Fund LP', accountName: 'default' },
  },
  {
    label: '7) valid investor + wrong account name (account belongs to someone else)',
    input: { investorName: 'Liberty Insurance', investorId: null, fundName: 'Keystone Capital Fund I', accountName: 'totally-different-account' },
  },
  {
    label: '8) all bogus',
    input: { investorName: 'Foo', investorId: 'XX-1', fundName: 'Bar', accountName: 'Baz' },
  },
  {
    label: '9) only investor name extracted (investorId auto-filled, single account auto-resolved)',
    input: { investorName: 'Atlas Crest Capital', investorId: null, fundName: null, accountName: null },
  },
];

for (const c of cases) {
  const out = validateExtractedFields(c.input);
  console.log('\n' + c.label);
  console.log('  input :', c.input);
  console.log('  output:', {
    investorName: out.investorName,
    investorId: out.investorId,
    fundName: out.fundName,
    accountName: out.accountName,
  });
  console.log('  flags :', out.validation);
}
