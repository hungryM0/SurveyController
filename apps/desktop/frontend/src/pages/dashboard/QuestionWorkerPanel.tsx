import { useState } from 'react'
import { Activity } from 'lucide-react'
import { Button, TableView } from '../../components/ui'
import type { DashboardState } from '../../types'

interface QuestionWorkerPanelProps {
  dashboard: DashboardState
}

function QuestionWorkerPanel({ dashboard }: QuestionWorkerPanelProps) {
  const [threadView, setThreadView] = useState<'questions' | 'progress'>('questions')
  const questionRows = dashboard.questionRows.map((row) => [
    String(row.index),
    row.type,
    row.dimension || '-',
    row.strategy || '-',
  ])
  const sessionRows = dashboard.sessionRows.map((row) => [row.thread, row.status, `${row.progress}%`])

  return (
    <section className="surface table-panel thread-table-panel dashboard-question-panel">
      <div className="panel-header table-panel-head">
        <div className="panel-title-group">
          <Activity size={18} />
          <h4>{threadView === 'questions' ? `题目清单 (${dashboard.questionRows.length})` : `会话进度 (${sessionRows.length})`}</h4>
        </div>
        <div className="thread-switch-row">
          <Button
            value="题目"
            type={threadView === 'questions' ? 'primary' : undefined}
            onClick={() => setThreadView('questions')}
          />
          <Button
            value="会话"
            type={threadView === 'progress' ? 'primary' : undefined}
            onClick={() => setThreadView('progress')}
          />
        </div>
      </div>

      <div className="table-wrapper-scroll question-table-scroll">
        {threadView === 'questions' ? (
          dashboard.questionRows.length === 0 ? (
            <div className="table-empty-state">
              <h5>未解析</h5>
              <p>粘贴链接后解析题目结构。</p>
            </div>
          ) : (
            <TableView
              columns={[
                { title: '序号', showSortIcon: false },
                { title: '类型', showSortIcon: false },
                { title: '映射维度', showSortIcon: false },
                { title: '作答策略', showSortIcon: false },
              ]}
              rows={questionRows}
              rowFontSize={13}
              headerFontSize={13}
            />
          )
        ) : sessionRows.length ? (
          <TableView
            columns={[
              { title: '线程', showSortIcon: false },
              { title: '状态', showSortIcon: false },
              { title: '进度', showSortIcon: false },
            ]}
            rows={sessionRows}
            rowFontSize={13}
            headerFontSize={13}
          />
        ) : (
          <div className="table-empty-state">
            <h5>未运行</h5>
            <p>任务启动后显示线程进度。</p>
          </div>
        )}
      </div>
    </section>
  )
}

export default QuestionWorkerPanel
