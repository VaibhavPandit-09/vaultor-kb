"""Package Artifact Tool's generated rows into the established Raw Runs sheet.

Keep the historical comparison and the rest of the existing workbook byte-identical.
"""
import csv
import os
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
TAG = '{' + NS + '}'
ET.register_namespace('', NS)


def strings(book):
    if 'xl/sharedStrings.xml' not in book.namelist():
        return []
    return [''.join(node.itertext()) for node in ET.fromstring(book.read('xl/sharedStrings.xml'))]


def value(cell, shared):
    if cell is None:
        return ''
    result = cell.findtext(TAG + 'v', '')
    if cell.get('t') == 's':
        return shared[int(result)]
    if cell.get('t') == 'inlineStr':
        return ''.join(cell.find(TAG + 'is').itertext())
    return result


def sheet_path(book, title):
    workbook = ET.fromstring(book.read('xl/workbook.xml'))
    sheet = next(row for row in workbook.find(TAG + 'sheets') if row.get('name') == title)
    key = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
    relations = ET.fromstring(book.read('xl/_rels/workbook.xml.rels'))
    target = next(rel.get('Target') for rel in relations if rel.get('Id') == sheet.get(key))
    return target[1:] if target.startswith('/') else 'xl/' + target


def package(destination, delta_path, canonical_path, first):
    with open(canonical_path, encoding='utf-8', newline='') as stream:
        reader = csv.reader(stream)
        next(reader)
        records = list(filter(lambda row: row and row[0], reader))
    with ZipFile(destination) as source, ZipFile(delta_path) as delta:
        entry = sheet_path(source, 'Raw Runs')
        original = source.read(entry)
        shared = strings(source)
        data = ET.fromstring(original).find(TAG + 'sheetData')
        rows = [row for row in data if int(row.get('r')) >= 5 and value(row.find(TAG + 'c'), shared)]
        ids = [value(row.find(TAG + 'c'), shared) for row in rows]
        if ids == [record[0] for record in records]:
            print('Workbook already includes the benchmark observations.')
            return
        historical_count = len(ids)
        if historical_count < first or ids != [record[0] for record in records[:historical_count]]:
            raise ValueError('Workbook run IDs do not match the canonical historical prefix')
        if any(int(row.get('r')) != offset + 5 for offset, row in enumerate(rows)):
            raise ValueError('Historical workbook rows are not sequential')
        new_rows = list(ET.fromstring(delta.read(sheet_path(delta, 'New Raw Runs'))).find(TAG + 'sheetData'))
        delta_strings = strings(delta)
        if [value(row.find(TAG + 'c'), delta_strings) for row in new_rows] != [record[0] for record in records[first:]]:
            raise ValueError('The generated additions do not match the canonical tail')
        new_rows = new_rows[historical_count - first:]
        styles = {re.match('[A-Z]+', cell.get('r'))[0]: cell.get('s') for cell in rows[-1]}
        fragments = []
        for offset, row in enumerate(new_rows, historical_count + 5):
            row.set('r', str(offset))
            for cell in row:
                column = re.match('[A-Z]+', cell.get('r'))[0]
                cell.set('r', column + str(offset))
                cell.attrib.pop('s', None)
                if styles.get(column) is not None:
                    cell.set('s', styles[column])
                if cell.get('t') == 's':
                    text = value(cell, delta_strings)
                    cell.remove(cell.find(TAG + 'v'))
                    cell.set('t', 'inlineStr')
                    inline = ET.SubElement(ET.SubElement(cell, TAG + 'is'), TAG + 't')
                    inline.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
                    inline.text = text
            fragments.append(ET.tostring(row, encoding='utf-8'))
        markers = list(re.finditer(rb'</(?:[\w.-]+:)?sheetData>', original))
        if len(markers) != 1:
            raise ValueError('Unexpected Raw Runs worksheet structure')
        if int(data[-1].get('r')) != historical_count + 4:
            raise ValueError('Raw Runs has formatted or noncanonical rows after the historical prefix')
        marker = markers[0].start()
        updated = original[:marker] + b''.join(fragments) + original[marker:]
        updated = re.sub(rb'(<(?:[\w.-]+:)?dimension ref="A1:R)\d+(")', lambda match: match[1] + str(len(records) + 4).encode() + match[2], updated, count=1)
        with tempfile.NamedTemporaryFile(dir=destination.parent, suffix='.xlsx', delete=False) as stream:
            temporary = Path(stream.name)
        try:
            with ZipFile(temporary, 'w', compression=ZIP_DEFLATED) as result:
                for item in source.infolist():
                    result.writestr(item, updated if item.filename == entry else source.read(item))
            source.close()
            os.replace(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
    print(f'Saved {len(new_rows)} benchmark observations after {historical_count} historical rows.')


if __name__ == '__main__':
    output, generated, canonical, prefix = sys.argv[1:]
    package(Path(output), generated, canonical, int(prefix))
