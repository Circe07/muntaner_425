import { useContext, useEffect } from "react"
import { Context } from "../../Context/Context"

import NavBar from "../NavBar/NavBar"
import CartElements from "./CartElements"
import CartTotal from "./CartTotal"
import PayPalCheckout from "../Payment/PayPalCheckout"
import Footer from "../Footer/Footer"

import './CartContent.css'

const CartContent = () => {
  const { cart } = useContext(Context)

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <NavBar />
      <div className="cart-page-wrapper">
        {cart.length > 0 ? (
          <>
            <div className="cart-container">
              <CartElements />
            </div>
            <CartTotal />
            <div className="paypal-container-wrapper">
              <PayPalCheckout />
            </div>
          </>
        ) : (
          <h2 className='cart-message-center'>Your cart is empty</h2>
        )}
      </div>
      <Footer />
    </>
  )
}

export default CartContent