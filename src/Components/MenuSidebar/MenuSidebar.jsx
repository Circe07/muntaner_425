import { useContext } from 'react'
import { Context } from '../../Context/Context'
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';
import './MenuSidebar.css'

const MenuSidebar = () => {
    const { isMenuOpen, closeMenu, setCategoryFilter } = useContext(Context)

    const handleCategoryClick = (category) => {
        setCategoryFilter(category)
        closeMenu()
    }

    return (
        <>
            <div
                className={`menu-sidebar-overlay ${isMenuOpen ? 'open' : ''}`}
                onClick={closeMenu}
            ></div>
            <div className={`menu-sidebar ${isMenuOpen ? 'open' : ''}`}>
                <div className="menu-header">
                    <button onClick={closeMenu} className="menu-close-btn"><ClearOutlinedIcon /></button>
                </div>

                <div className="menu-section">
                    <h3>For Him</h3>
                    <span className="menu-item" onClick={() => handleCategoryClick('men')}>All Products</span>
                    <span className="menu-item" onClick={() => handleCategoryClick('men')}>Face Care</span>
                    <span className="menu-item" onClick={() => handleCategoryClick('men')}>Body & Bath</span>
                </div>

                <div className="menu-section">
                    <h3>For Her</h3>
                    <span className="menu-item" onClick={() => handleCategoryClick('women')}>All Products</span>
                    <span className="menu-item" onClick={() => handleCategoryClick('women')}>Skincare</span>
                    <span className="menu-item" onClick={() => handleCategoryClick('women')}>Fragrance</span>
                </div>

                <div className="menu-section">
                    <span className="menu-item" onClick={() => handleCategoryClick('all')} style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>View All</span>
                </div>
            </div>
        </>
    )
}

export default MenuSidebar
