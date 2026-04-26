/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { exportToCSV } from './ExportUtils.ts';

describe('exportToCSV', () => {
  let originalDocument: any;
  let originalURLCreateObjectURL: any;
  let originalURLRevokeObjectURL: any;
  let originalBlob: any;

  let downloadedContent: string | null = null;
  let downloadedFilename: string | null = null;
  let downloadedMimeType: string | null = null;

  beforeEach(() => {
    downloadedContent = null;
    downloadedFilename = null;
    downloadedMimeType = null;

    // Save originals
    originalDocument = globalThis.document;
    originalURLCreateObjectURL = globalThis.URL.createObjectURL;
    originalURLRevokeObjectURL = globalThis.URL.revokeObjectURL;
    originalBlob = globalThis.Blob;

    // Mock URL methods
    globalThis.URL.createObjectURL = (_blob: any) => {
      return 'mock-url';
    };
    globalThis.URL.revokeObjectURL = () => {};

    // Mock document
    const mockLink = {
      href: '',
      download: '',
      click() {
        downloadedFilename = this.download;
      }
    };

    globalThis.document = {
      createElement: (tag: string) => {
        if (tag === 'a') return mockLink;
        return {};
      },
      body: {
        appendChild: () => {},
        removeChild: () => {},
      }
    } as any;

    // Mock Blob to capture content
    globalThis.Blob = class MockBlob {
      constructor(content: any[], options: any) {
        downloadedContent = content[0];
        downloadedMimeType = options?.type;
      }
    } as any;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    globalThis.URL.createObjectURL = originalURLCreateObjectURL;
    globalThis.URL.revokeObjectURL = originalURLRevokeObjectURL;
    globalThis.Blob = originalBlob;
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
    const data: any[] = [];
    exportToCSV(data, 'empty');

    assert.strictEqual(downloadedFilename, 'empty.csv');
    // Papa.unparse with empty array returns empty string by default
    assert.strictEqual(downloadedContent, '');
  });
});
