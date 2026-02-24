import { HashRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import RechnungPage from '@/pages/RechnungPage';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardOverview />} />
          <Route path="rechnung" element={<RechnungPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}