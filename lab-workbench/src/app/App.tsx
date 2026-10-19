import { useEffect } from 'react';
import { Provider } from 'react-redux';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { NotFoundPage } from '@/components/pages/NotFoundPage';
import { WorkbenchPage } from '@/components/pages/WorkbenchPage';
import { connectServer } from '@/features/server/thunks';
import { useAppDispatch, useAppSelector } from './hooks';
import { store } from './store';

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/labs/hello" replace /> },
  { path: '/labs/:labId', element: <WorkbenchPage /> },
  { path: '/labs/:labId/boards/:boardId', element: <WorkbenchPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

const ThemeSync: React.FC = () => {
  const theme = useAppSelector((s) => s.ui.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('perf-lab:theme', theme);
    } catch {
      // storage can be unavailable (private windows); the theme still applies for this session
    }
  }, [theme]);
  return null;
};

/** Connects to the lab server once; the workbench works offline on synthetic data if it is not running. */
const ServerSync: React.FC = () => {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(connectServer());
  }, [dispatch]);
  return null;
};

export const App: React.FC = () => (
  <Provider store={store}>
    <ThemeSync />
    <ServerSync />
    <RouterProvider router={router} />
  </Provider>
);
