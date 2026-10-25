/// <reference types="vite/client" />
import { createRoot } from 'react-dom/client'
import { Panel } from './panel/Panel'
import { Staff } from './staff/Staff'
import './panel/panel.css'
import './staff/staff.css'

const isStaff = location.pathname.startsWith('/staff')
createRoot(document.getElementById('root')!).render(isStaff ? <Staff /> : <Panel />)
