import { filterItems, shouldShowAddNew, shouldShowExcludedNotice } from '../src/app/components/combobox';

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

describe('filterItems with excludeItems (D-10)', () => {
  it('excludes items from the filtered list when input is empty', () => {
    expect(filterItems(['Alice', 'Bob', 'Carol'], '', ['Alice'])).toEqual(['Bob', 'Carol']);
  });
  it('excludes items that also match the substring filter', () => {
    expect(filterItems(['Alice', 'Bob', 'Carol'], 'al', ['Alice'])).toEqual([]);
  });
  it('is case-insensitive on the exclude list', () => {
    expect(filterItems(['Alice', 'Bob', 'Carol'], '', ['alice'])).toEqual(['Bob', 'Carol']);
  });
  it('is backward compatible — undefined excludeItems leaves filter unchanged', () => {
    expect(filterItems(['Alice', 'Bob'], 'ob', undefined)).toEqual(['Bob']);
  });
  it('is backward compatible — empty excludeItems leaves filter unchanged', () => {
    expect(filterItems(['Alice', 'Bob'], 'ob', [])).toEqual(['Bob']);
  });
  it('excludes multiple items', () => {
    expect(filterItems(['Alice', 'Bob', 'Carol', 'Dave'], '', ['Alice', 'Carol'])).toEqual(['Bob', 'Dave']);
  });
});

describe('shouldShowExcludedNotice (D-12)', () => {
  it('returns true when typed input exactly matches an excluded item (case-insensitive)', () => {
    expect(shouldShowExcludedNotice(['Alice'], 'alice')).toBe(true);
  });
  it('returns true for exact case match', () => {
    expect(shouldShowExcludedNotice(['Alice'], 'Alice')).toBe(true);
  });
  it('returns false for partial match (add-new should still be available)', () => {
    expect(shouldShowExcludedNotice(['Alice'], 'ali')).toBe(false);
  });
  it('returns false when exclude list is undefined', () => {
    expect(shouldShowExcludedNotice(undefined, 'alice')).toBe(false);
  });
  it('returns false when exclude list is empty', () => {
    expect(shouldShowExcludedNotice([], 'alice')).toBe(false);
  });
  it('returns false on empty input', () => {
    expect(shouldShowExcludedNotice(['Alice'], '')).toBe(false);
  });
  it('returns false on whitespace-only input', () => {
    expect(shouldShowExcludedNotice(['Alice'], '   ')).toBe(false);
  });
  it('trims typed input before collision check', () => {
    expect(shouldShowExcludedNotice(['Alice'], '  alice  ')).toBe(true);
  });
});
