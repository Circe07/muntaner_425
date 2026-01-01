import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { Context } from '../../Context/Context'
import CartItemCounter from '../CartContent/CartItemCounter'
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';
import './CartSidebar.css'

const CartSidebar = () => {
    const { cart, isCartOpen, closeCart, deleteProduct } = useContext(Context)

    const total = cart.reduce((acc, el) => acc + el.price * el.quanty, 0)

    return (
        <>
            <div
                className={`cart-sidebar-overlay ${isCartOpen ? 'open' : ''}`}
                onClick={closeCart}
            ></div>
            <div className={`cart-sidebar ${isCartOpen ? 'open' : ''}`}>
                <div className="cart-sidebar-header">
                    <h2>Your Bag</h2>
                    <button onClick={closeCart} className="close-btn"><ClearOutlinedIcon /></button>
                </div>

                <div className="cart-sidebar-content">
                    {cart.length === 0 ? (
                        <p style={{ textAlign: 'center', marginTop: '50px' }}>Your bag is empty.</p>
                    ) : (
                        cart.map((product) => (
                            <div key={product.id} className="mini-cart-item">
                                <img src={product.img} alt={product.name} />
                                <div className="mini-cart-details">
                                    <h3>{product.name}</h3>
                                    <CartItemCounter product={product} />
                                    <p>{product.price * product.quanty}<EuroOutlinedIcon /></p>
                                </div>
                                <button
                                    className="mini-delete-btn"
                                    onClick={() => deleteProduct(product.id)}
                                >
                                    <ClearOutlinedIcon />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <div className="cart-sidebar-footer">
                    <div className="total-display">
                        <span>Total:</span>
                        <span>{total}<EuroOutlinedIcon /></span>
                    </div>
                    <Link to="/cart" onClick={closeCart}>
                        <button className="checkout-btn">Checkout</button>
                    </Link>
                </div>
            </div>
        </>
    )
}

export default CartSidebar
