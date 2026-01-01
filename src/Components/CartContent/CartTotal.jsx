import { useContext } from "react"
import { Context } from "../../Context/Context"
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';

const CartTotal = () => {
  const { cart } = useContext(Context)

  const total = cart.reduce((acc, el) => acc + el.price * el.quanty, 0)
  return (
    <div className="cartTotal">
      <h3>Total a pagar:  {total} <EuroOutlinedIcon /></h3>
    </div>
  )
}

export default CartTotal