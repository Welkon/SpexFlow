import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './App.css'
import { RelaceSearchTester } from './RelaceSearchTester'

const initialNodes = [
  {
    id: '1',
    type: 'default',
    position: { x: 100, y: 100 },
    data: { label: 'Hello' },
  },
  {
    id: '2',
    type: 'default',
    position: { x: 300, y: 200 },
    data: { label: 'World' },
  },
]

const initialEdges = [{ id: 'e1-2', source: '1', target: '2' }]

export default function App() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  )

  return (
    <div className="app">
      <div className="layout">
        <div className="sidebar">
          <RelaceSearchTester />
        </div>
        <div className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}
