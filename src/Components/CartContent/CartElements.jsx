import { useContext } from "react"
import { Context } from "../../Context/Context"
import CartItemCounter from "./CartItemCounter"
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';

const CartElements = () => {
    const { cart, deleteProduct } = useContext(Context)

    return cart.map((product) => {
        return (
            <div className="cart-item-row" key={product.id}>
                <img src={product.img} alt="product-card" />
                <div className="cart-item-details">
                    <h3>{product.name}</h3>
                    <CartItemCounter product={product} />
                    <h4>{product.price * product.quanty}<EuroOutlinedIcon /></h4>
                </div>
                <h3 className="cart-delete-product" onClick={() => deleteProduct(product.id)}>
                    <ClearOutlinedIcon />
                </h3>
            </div>
        )
    })

}

export default CartElements