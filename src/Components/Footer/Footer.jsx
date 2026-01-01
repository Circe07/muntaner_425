import { useContext } from 'react'
import { Link } from 'react-router-dom'
import { Context } from '../../Context/Context'
import './Footer.css'

const Footer = () => {
    const { setCategoryFilter } = useContext(Context)

    const handleFilter = (category) => {
        setCategoryFilter(category)
        window.scrollTo(0, 0)
    }

    return (
        <footer className="footer">
            <div className="footer-content">
                <div className="footer-section">
                    <h3>Mountaner 425</h3>
                    <p>Premium care for everyone.</p>
                </div>
                <div className="footer-section">
                    <h3>Shop</h3>
                    <ul>
                        <li><Link to="/" onClick={() => handleFilter('men')}>Men's Care</Link></li>
                        <li><Link to="/" onClick={() => handleFilter('women')}>Women's Care</Link></li>
                    </ul>
                </div>
                <div className="footer-section">
                    <h3>Support</h3>
                    <ul>
                        <li><Link to="/contact">Contact Us</Link></li>
                        <li><Link to="/claims">Shipping & Returns</Link></li>
                    </ul>
                </div>
            </div>
            <div className="footer-bottom">
                <p>&copy; 2025 Mountaner 425. All rights reserved.</p>
            </div>
        </footer>
    )
}

export default Footer
