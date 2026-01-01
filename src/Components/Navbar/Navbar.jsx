import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { Context } from '../../Context/Context'
import './NavBar.css'
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import MenuOutlinedIcon from '@mui/icons-material/MenuOutlined';

const NavBar = () => {
  const { openCart, cart, openMenu } = useContext(Context)
  const totalItems = cart.reduce((acc, el) => acc + el.quanty, 0)

  return (
    <div className="nav-container">
      <nav className="navbar">
        <div className="burguer-logo" onClick={openMenu} style={{ cursor: 'pointer' }}>
          <MenuOutlinedIcon />
        </div>
        <Link to='/'>
          <div className="home-logo">Muntaner 425</div>
        </Link>
        <div className="navbar-cart" onClick={openCart} style={{ cursor: 'pointer' }}>
          <div><ShoppingBagOutlinedIcon /></div>
        </div>
      </nav>
    </div>
  )
}

export default NavBar