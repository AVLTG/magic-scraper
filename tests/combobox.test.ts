import { filterItems, shouldShowAddNew } from '../src/app/components/combobox';

describe('filterItems', () => {
  it('returns items matching the input case-insensitively', () => {
    expect(filterItems(['Alice', 'Bob', 'Carol'], 'al')).toEqual(['Alice']);
  });
  it('returns multiple matches', () => {
    expect(filterItems(['Alice', 'alfred', 'Bob'], 'al')).toEqual(['Alice', 'alfred']);
  });
  it('returns all items when input is empty', () => {
    expect(filterItems(['Alice', 'Bob'], '')).toEqual(['Alice', 'Bob']);
  });
  it('returns empty array for empty items list', () => {
    expect(filterItems([], 'anything')).toEqual([]);
  });
  it('is case-insensitive on both sides', () => {
    expect(filterItems(['alice'], 'AL')).toEqual(['alice']);
  });
});

describe('shouldShowAddNew', () => {
  it('returns true when input has no match', () => {
    expect(shouldShowAddNew(['Alice'], 'zara')).toBe(true);
  });
  it('returns false when input exactly matches (case-insensitive lower)', () => {
    expect(shouldShowAddNew(['Alice'], 'alice')).toBe(false);
  });
  it('returns false when input exactly matches (case-insensitive same-case)', () => {
    expect(shouldShowAddNew(['Alice'], 'Alice')).toBe(false);
  });
  it('returns true on partial match (not exact)', () => {
    expect(shouldShowAddNew(['Alice'], 'al')).toBe(true);
  });
  it('returns false on empty input', () => {
    expect(shouldShowAddNew(['Alice'], '')).toBe(false);
  });
  it('returns false on whitespace-only input', () => {
    expect(shouldShowAddNew(['Alice'], '   ')).toBe(false);
  });
});
