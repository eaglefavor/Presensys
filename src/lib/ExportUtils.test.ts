import { test, describe, beforeEach, afterEach } from 'node:test';
import type { TestContext } from 'node:test';
import * as assert from 'node:assert';
import { shareData, exportToCSV, exportToPDF, downloadText } from './ExportUtils.ts';

type NavigatorWithShare = Navigator & {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText?: (text: string) => Promise<void> };
};
type MockFn = ReturnType<TestContext['mock']['fn']>;
type JsPdfMock = {
  constructor: MockFn;
  setFontSize: MockFn;
  setFont: MockFn;
  text: MockFn;
  setTextColor: MockFn;
  save: MockFn;
};

describe('shareData', () => {
  let originalDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: undefined,
        clipboard: {
          writeText: undefined,
        },
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'navigator', originalDescriptor);
    } else {
      // Property didn't exist originally — remove it
      delete (globalThis as Record<string, unknown>).navigator;
    }
  });

  test('returns true when navigator.share succeeds', async () => {
    let shared = false;
    const navigatorRef = globalThis.navigator as NavigatorWithShare;
    navigatorRef.share = async (data: ShareData) => {
      shared = true;
      assert.strictEqual(data?.title, 'Test Title');
      assert.strictEqual(data?.text, 'Test Text');
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(shared, true);
  });

  test('returns false when navigator.share throws AbortError (user cancelled)', async () => {
    const navigatorRef = globalThis.navigator as NavigatorWithShare;
    navigatorRef.share = async () => {
      const error = new Error('User cancelled');
      error.name = 'AbortError';
      throw error;
    };

    let clipboardCalled = false;
    navigatorRef.clipboard = {
      writeText: async () => {
        clipboardCalled = true;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, false);
    assert.strictEqual(clipboardCalled, false, 'Should not fallback to clipboard on AbortError');
  });

  test('falls back to clipboard when navigator.share is undefined', async () => {
    // navigator.share is undefined from beforeEach
    let clipboardText = '';
    const navigatorRef = globalThis.navigator as NavigatorWithShare;
    navigatorRef.clipboard = {
      writeText: async (text: string) => {
        clipboardText = text;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(clipboardText, 'Test Text');
  });

  test('falls back to clipboard when navigator.share throws non-AbortError', async () => {
    const navigatorRef = globalThis.navigator as NavigatorWithShare;
    navigatorRef.share = async () => {
      throw new Error('NotSupportedError');
    };

    let clipboardText = '';
    navigatorRef.clipboard = {
      writeText: async (text: string) => {
        clipboardText = text;
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, true);
    assert.strictEqual(clipboardText, 'Test Text');
  });

  test('returns false when both navigator.share and clipboard.writeText fail', async () => {
    const navigatorRef = globalThis.navigator as NavigatorWithShare;
    navigatorRef.share = async () => {
      throw new Error('NotSupportedError');
    };

    navigatorRef.clipboard = {
      writeText: async () => {
        throw new Error('Clipboard denied');
      }
    };

    const result = await shareData('Test Text', 'Test Title');
    assert.strictEqual(result, false);
  });
});

describe('exportToCSV', () => {

  type MockLink = { href: string; download: string; click: () => void };
  type MockDocument = {
    createElement: (tag: string) => MockLink | Record<string, unknown>;
    body: { appendChild: () => void; removeChild: () => void };
  };

  let originalDocument: Document | undefined;

  let originalURLCreateObjectURL: ((obj: Blob) => string) | undefined;

  let originalURLRevokeObjectURL: ((url: string) => void) | undefined;

  let originalBlob: typeof Blob | undefined;

  let downloadedContent: string | null = null;
  let downloadedFilename: string | null = null;
  let downloadedMimeType: string | null = null;

  beforeEach(() => {
    downloadedContent = null;
    downloadedFilename = null;
    downloadedMimeType = null;

    // Save originals
    originalDocument = globalThis.document;
    originalURLCreateObjectURL = globalThis.URL.createObjectURL?.bind(globalThis.URL);
    originalURLRevokeObjectURL = globalThis.URL.revokeObjectURL?.bind(globalThis.URL);
    originalBlob = globalThis.Blob;

    // Mock URL methods

    globalThis.URL.createObjectURL = (_blob: Blob) => {
      return 'mock-url';
    };
    globalThis.URL.revokeObjectURL = () => {};

    // Mock document
    const mockLink: MockLink = {
      href: '',
      download: '',
      click() {
        downloadedFilename = this.download;
      }
    };

    const mockDocument: MockDocument = {
      createElement: (tag: string) => {
        if (tag === 'a') return mockLink;
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      }
    };
    globalThis.document = mockDocument as unknown as Document;

    // Mock Blob to capture content
    class MockBlob {
      constructor(content: BlobPart[], options?: BlobPropertyBag) {
        downloadedContent = content[0];
        downloadedMimeType = options?.type;
      }
    }
    globalThis.Blob = MockBlob as unknown as typeof Blob;
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    }
    if (originalURLCreateObjectURL) {
      globalThis.URL.createObjectURL = originalURLCreateObjectURL;
    }
    if (originalURLRevokeObjectURL) {
      globalThis.URL.revokeObjectURL = originalURLRevokeObjectURL;
    }
    if (originalBlob) {
      globalThis.Blob = originalBlob;
    }
  });

  test('should generate and download simple CSV without metadata', () => {
    const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
    exportToCSV(data, 'users');

    assert.strictEqual(downloadedFilename, 'users.csv');
    assert.strictEqual(downloadedMimeType, 'text/csv;charset=utf-8;');
    assert.ok(downloadedContent !== null, 'Downloaded content should not be null');

    const expectedCSV = 'name,age\nAlice,30\nBob,25';
    assert.strictEqual((downloadedContent as string).replace(/\r\n/g, '\n'), expectedCSV);
  });

  test('should prepend all metadata if available', () => {
    const data = [{ id: 1, val: 'A' }];
    const meta = { faculty: 'Engineering', department: 'Computer Science', level: '400' };
    exportToCSV(data, 'report', meta);

    assert.ok(downloadedContent !== null, 'Downloaded content should not be null');
    const expectedCSV = 'Faculty,Engineering\nDepartment,Computer Science\nLevel,400\n\nid,val\n1,A';
    assert.strictEqual((downloadedContent as string).replace(/\r\n/g, '\n'), expectedCSV);
  });

  test('should prepend partial metadata if available', () => {
    const data = [{ id: 1 }];
    const meta = { faculty: 'Science' };
    exportToCSV(data, 'report_partial', meta);

    assert.ok(downloadedContent !== null, 'Downloaded content should not be null');
    const expectedCSV = 'Faculty,Science\n\nid\n1';
    assert.strictEqual((downloadedContent as string).replace(/\r\n/g, '\n'), expectedCSV);
  });

  test('should handle empty data array gracefully', () => {

    const data: Array<Record<string, unknown>> = [];
    exportToCSV(data, 'empty');

    assert.strictEqual(downloadedFilename, 'empty.csv');
    // Papa.unparse with empty array returns empty string by default
    assert.strictEqual(downloadedContent, '');
  });
});

describe('downloadText', () => {

  type MockLink = { href: string; download: string; click: () => void };
  type MockDocument = {
    createElement: (tag: string) => MockLink | Record<string, unknown>;
    body: { appendChild: () => void; removeChild: () => void };
  };

  let originalDocument: Document | undefined;

  let originalURLCreateObjectURL: ((obj: Blob) => string) | undefined;

  let originalURLRevokeObjectURL: ((url: string) => void) | undefined;

  let originalBlob: typeof Blob | undefined;

  let downloadedContent: string | null = null;
  let downloadedFilename: string | null = null;
  let downloadedMimeType: string | null = null;

  beforeEach(() => {
    downloadedContent = null;
    downloadedFilename = null;
    downloadedMimeType = null;

    // Save originals
    originalDocument = globalThis.document;
    originalURLCreateObjectURL = globalThis.URL.createObjectURL?.bind(globalThis.URL);
    originalURLRevokeObjectURL = globalThis.URL.revokeObjectURL?.bind(globalThis.URL);
    originalBlob = globalThis.Blob;

    // Mock URL methods

    globalThis.URL.createObjectURL = (_blob: Blob) => {
      return 'mock-url';
    };
    globalThis.URL.revokeObjectURL = () => {};

    // Mock document
    const mockLink: MockLink = {
      href: '',
      download: '',
      click() {
        downloadedFilename = this.download;
      }
    };

    const mockDocument: MockDocument = {
      createElement: (tag: string) => {
        if (tag === 'a') return mockLink;
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      }
    };
    globalThis.document = mockDocument as unknown as Document;

    // Mock Blob to capture content
    class MockBlob {
      constructor(content: BlobPart[], options?: BlobPropertyBag) {
        downloadedContent = content[0];
        downloadedMimeType = options?.type;
      }
    }
    globalThis.Blob = MockBlob as unknown as typeof Blob;
  });

  afterEach(() => {
    if (originalDocument) {
      globalThis.document = originalDocument;
    }
    if (originalURLCreateObjectURL) {
      globalThis.URL.createObjectURL = originalURLCreateObjectURL;
    }
    if (originalURLRevokeObjectURL) {
      globalThis.URL.revokeObjectURL = originalURLRevokeObjectURL;
    }
    if (originalBlob) {
      globalThis.Blob = originalBlob;
    }
  });

  test('should download text with .txt extension', () => {
    const text = 'Hello world';
    const filename = 'test-file';
    downloadText(text, filename);

    assert.strictEqual(downloadedFilename, 'test-file.txt');
    assert.strictEqual(downloadedContent, text);
    assert.strictEqual(downloadedMimeType, 'text/plain;charset=utf-8;');
  });

  test('should handle empty text', () => {
    downloadText('', 'empty');
    assert.strictEqual(downloadedFilename, 'empty.txt');
    assert.strictEqual(downloadedContent, '');
  });
});

describe('exportToPDF', () => {
  beforeEach((t: TestContext) => {
    // Reset mocks before each test
    const jsPDFMock: JsPdfMock = {
      constructor: t.mock.fn(),
      setFontSize: t.mock.fn(),
      setFont: t.mock.fn(),
      text: t.mock.fn(),
      setTextColor: t.mock.fn(),
      save: t.mock.fn(),
    };
    const autoTableMock: MockFn = t.mock.fn();
    const globalMocks = globalThis as unknown as { __jsPDFMock?: JsPdfMock; __autoTableMock?: MockFn };
    globalMocks.__jsPDFMock = jsPDFMock;
    globalMocks.__autoTableMock = autoTableMock;
  });

  afterEach(() => {
    const globalMocks = globalThis as unknown as { __jsPDFMock?: JsPdfMock; __autoTableMock?: MockFn };
    delete globalMocks.__jsPDFMock;
    delete globalMocks.__autoTableMock;
  });

  test('should generate PDF with correct title and filename (empty data)', () => {
    exportToPDF([], 'Attendance Report', 'attendance_empty');

    const jsPDFMock = (globalThis as unknown as { __jsPDFMock: JsPdfMock }).__jsPDFMock;

    assert.strictEqual(jsPDFMock.constructor.mock.calls.length, 1);
    assert.deepStrictEqual(jsPDFMock.constructor.mock.calls[0].arguments, [{ orientation: 'landscape' }]);

    assert.strictEqual(jsPDFMock.save.mock.calls.length, 1);
    assert.deepStrictEqual(jsPDFMock.save.mock.calls[0].arguments, ['attendance_empty.pdf']);

    // Title checks
    const textCalls = jsPDFMock.text.mock.calls.map(call => call.arguments as [string, number, number]);
    assert.ok(textCalls.some(([text, x, y]) => text === 'Attendance Report' && x === 14 && y === 15));

    // Subtitle checks (should include 'Generated:' and 'Presensys - UNIZIK')
    const subtitleCall = textCalls.find(([text]) => text.includes('Generated:') && text.includes('Presensys - UNIZIK'));
    assert.ok(subtitleCall, 'Should output subtitle with Generated date and branding');
    assert.strictEqual(subtitleCall?.[1], 14);
    assert.strictEqual(subtitleCall?.[2], 22);

    // No autoTable since empty data
    const autoTableMock = (globalThis as unknown as { __autoTableMock: MockFn }).__autoTableMock;
    assert.strictEqual(autoTableMock.mock.calls.length, 0);
  });

  test('should generate PDF with data triggering autoTable', () => {
    const data = [{ Name: 'John Doe', RegNo: '2020123456' }, { Name: 'Jane Smith', RegNo: '2020654321' }];
    exportToPDF(data, 'Student List', 'students');

    const autoTableMock = (globalThis as unknown as { __autoTableMock: MockFn }).__autoTableMock;
    assert.strictEqual(autoTableMock.mock.calls.length, 1);

    const [doc, options] = autoTableMock.mock.calls[0].arguments as [unknown, { head: string[][]; body: string[][]; startY: number }];
    assert.ok(doc, 'autoTable should receive doc instance');

    assert.deepStrictEqual(options.head, [['Name', 'RegNo']]);
    assert.deepStrictEqual(options.body, [
      ['John Doe', '2020123456'],
      ['Jane Smith', '2020654321']
    ]);
    assert.strictEqual(options.startY, 28);
  });

  test('should include academic metadata in subtitle when provided', () => {
    const meta = { faculty: 'Engineering', department: 'Computer Science', level: '400' };
    exportToPDF([], 'Meta Test', 'meta', meta);

    const jsPDFMock = (globalThis as unknown as { __jsPDFMock: JsPdfMock }).__jsPDFMock;
    const textCalls = jsPDFMock.text.mock.calls.map(call => call.arguments as [string, number, number]);
    const subtitleCall = textCalls.find(([text]) => text.includes('Faculty: Engineering') && text.includes('Dept: Computer Science') && text.includes('Level: 400'));

    assert.ok(subtitleCall, 'Should include faculty, department, and level in subtitle');
  });
});
