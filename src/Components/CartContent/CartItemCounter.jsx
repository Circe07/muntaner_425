import { useContext } from "react"
import { Context } from "../../Context/Context"

const CartItemCounter = ({ product }) => {
    const { buyProducts, decreaseQuantity } = useContext(Context)

    return (
        <div className="counter-container">
            <button className="counter-button" onClick={() => decreaseQuantity(product)}>
                -
            </button>
            <span className="counter-value">{product.quanty}</span>
            <button className="counter-button" onClick={() => buyProducts(product)}>
                +
            </button>
        </div>
    )
}

export default CartItemCounter