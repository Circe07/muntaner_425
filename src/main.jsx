import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { PayPalScriptProvider } from "@paypal/react-paypal-js";
import CartContent from './Components/CartContent/CartContent.jsx'
import Contact from './Components/Contact/Contact.jsx'
import Claims from './Components/Claims/Claims.jsx'
import App from './App.jsx'
import ContextProvider from './Context/Context.jsx'
import './index.css'

import ProductDetail from './Components/ProductDetail/ProductDetail.jsx'

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />
  },
  {
    path: '/product/:id',
    element: <ProductDetail />
  },
  {
    path: '/cart',
    element: <CartContent />
  },
  {
    path: '/contact',
    element: <Contact />
  },
  {
    path: '/claims',
    element: <Claims />
  },
])

const initialOptions = {
  "client-id": "test", // Sandbox ID
  currency: "EUR",
  intent: "capture",
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PayPalScriptProvider options={initialOptions}>
      <ContextProvider>
        <RouterProvider router={router} />
      </ContextProvider>
    </PayPalScriptProvider>
  </StrictMode>,
)
