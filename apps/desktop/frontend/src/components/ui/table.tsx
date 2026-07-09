import { useMemo, useState, type ReactNode } from 'react'

interface TableColumn {
  title: string
  sortable?: boolean
  showSortIcon?: boolean
}

interface TableViewProps {
  columns?: TableColumn[]
  rows?: string[][]
  rowFontSize?: number
  headerFontSize?: number
  TableHeaderComponent?: ReactNode
  TableFooterComponent?: ReactNode
}

function compareCell(left: string, right: string) {
  return left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
}

function TableView({
  columns = [],
  rows = [],
  rowFontSize = 16,
  headerFontSize = 18,
  TableHeaderComponent,
  TableFooterComponent,
}: TableViewProps) {
  const [sortColumn, setSortColumn] = useState<number | undefined>(undefined)
  const visibleRows = useMemo(() => {
    if (sortColumn === undefined) {
      return rows
    }
    return [...rows].sort((left, right) => compareCell(left[sortColumn] ?? '', right[sortColumn] ?? ''))
  }, [rows, sortColumn])

  function toggleSort(index: number, sortable?: boolean) {
    if (sortable === false) {
      return
    }
    setSortColumn((current) => current === index ? undefined : index)
  }

  return (
    <div className="sc-table-view-container">
      {TableHeaderComponent}
      <table className="sc-table-view">
        <thead style={{ fontSize: headerFontSize }}>
          <tr className="sc-table-row">
            {columns.map((column, index) => (
              <th
                className={column.sortable === false ? 'no-sortable' : 'sortable'}
                align="left"
                key={`${column.title}-${index}`}
                onClick={() => toggleSort(index, column.sortable)}
              >
                {column.title}
                {column.showSortIcon === false ? null : (
                  <span className={`sc-table-sort-icon ${sortColumn === index ? 'asc' : 'desc'}`} aria-hidden="true" />
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody style={{ fontSize: rowFontSize }}>
          {visibleRows.map((row, rowIndex) => (
            <tr key={`${rowIndex}-${row.join('|')}`}>
              {row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {TableFooterComponent}
    </div>
  )
}

export default TableView
export type { TableColumn, TableViewProps }
