import { useContext } from "react"
import { useNavigate } from "react-router-dom"
import { Context } from "../../Context/Context"
import "./products.css"
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';

const ProductCard = ({ product, buyProducts }) => {
    const navigate = useNavigate();

    return (
        <div className="card" onClick={() => navigate(`/product/${product.id}`)} style={{ cursor: 'pointer' }}>
            <div className="card-image-container">
                <img src={product.img} alt={product.name} />
            </div>
            <div className="card-info">
                <h3>{product.name}</h3>
                <div className="card-footer">
                    <h4>{product.price}<EuroOutlinedIcon /></h4>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            buyProducts(product);
                        }}
                        className="add-btn"
                        title="Add to Cart"
                    >
                        <ShoppingBagOutlinedIcon />
                    </button>
                </div>
            </div>
        </div>
    )
}

const Products = () => {
    const context = useContext(Context)
    const { products = [], buyProducts, categoryFilter, setCategoryFilter } = context || {}

    const filteredProducts = products.filter(product => {
        if (categoryFilter === 'all') return true
        return product.category === categoryFilter
    })

    return (
        <div className="products-page-container">
            <div className="filter-container">
                <button
                    className={`filter-btn ${categoryFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('all')}
                >
                    All
                </button>
                <button
                    className={`filter-btn ${categoryFilter === 'men' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('men')}
                >
                    For Him
                </button>
                <button
                    className={`filter-btn ${categoryFilter === 'women' ? 'active' : ''}`}
                    onClick={() => setCategoryFilter('women')}
                >
                    For Her
                </button>
            </div>

            <div className="product-card-container">
                {filteredProducts.map((product) => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        buyProducts={buyProducts}
                    />
                ))}
            </div>
        </div>
    )
}

export default Products