import { useContext, useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Context } from '../../Context/Context'
import NavBar from '../NavBar/NavBar'
import Footer from '../Footer/Footer'
import CartSidebar from '../CartSidebar/CartSidebar'
import MenuSidebar from '../MenuSidebar/MenuSidebar'
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ArrowBackIosNewOutlinedIcon from '@mui/icons-material/ArrowBackIosNewOutlined';
import ArrowForwardIosOutlinedIcon from '@mui/icons-material/ArrowForwardIosOutlined';
import './ProductDetail.css'

const ProductDetail = () => {
    const { id } = useParams()
    const context = useContext(Context)
    const { products = [], buyProducts } = context || {}
    const [product, setProduct] = useState(null)
    const [quantity, setQuantity] = useState(1)
    const [relatedProducts, setRelatedProducts] = useState([])
    const scrollRef = useRef(null)

    useEffect(() => {
        const productId = parseInt(id)
        const foundProduct = products.find(p => p.id === productId)

        if (foundProduct) {
            setProduct(foundProduct)
            // Get more related products for carousel
            const related = products
                .filter(p => p.id !== productId)
                .slice(0, 8)
            setRelatedProducts(related)
        }
    }, [id, products])

    const increaseQuantity = () => setQuantity(prev => prev + 1)
    const decreaseQuantity = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1))

    const scroll = (direction) => {
        if (scrollRef.current) {
            const { current } = scrollRef
            const scrollAmount = 300 // Slightly more than card width
            if (direction === 'left') {
                current.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
            } else {
                current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
            }
        }
    }

    if (!product) return <div className="loading">Loading...</div>

    return (
        <div className="product-detail-wrapper">
            <MenuSidebar />
            <CartSidebar />
            <NavBar />

            <div className="product-detail-container">
                <div className="product-main">
                    <div className="product-image-section">
                        <img src={product.img} alt={product.name} />
                    </div>

                    <div className="product-info-section">
                        <h1 className="product-title">{product.name}</h1>
                        <span className="product-ref">REF: {product.id}</span>

                        <p className="product-desc">{product.description}</p>

                        <div className="product-price">
                            {product.price}<EuroOutlinedIcon style={{ fontSize: '0.9em' }} />
                        </div>

                        <div className="product-actions-row">
                            <div className="pdp-quantity-selector">
                                <button onClick={decreaseQuantity}>-</button>
                                <span>{quantity}</span>
                                <button onClick={increaseQuantity}>+</button>
                            </div>
                            <button className="pdp-add-btn" onClick={() => buyProducts(product, quantity)}>
                                AÑADIR A LA CESTA
                            </button>
                        </div>
                    </div>
                </div>

                <div className="recommendations-section">
                    <h2>TAMBIÉN TE PUEDE GUSTAR</h2>
                    <div className="carousel-container">
                        <button className="carousel-btn left" onClick={() => scroll('left')}>
                            <ArrowBackIosNewOutlinedIcon />
                        </button>
                        <div className="recommendations-carousel" ref={scrollRef}>
                            {relatedProducts.map(p => (
                                <Link to={`/product/${p.id}`} key={p.id} className="rec-card">
                                    <div className="rec-image">
                                        <img src={p.img} alt={p.name} />
                                    </div>
                                    <h3>{p.name}</h3>
                                    <div className="rec-price">
                                        {p.price}<EuroOutlinedIcon style={{ fontSize: '0.8em' }} />
                                    </div>
                                </Link>
                            ))}
                        </div>
                        <button className="carousel-btn right" onClick={() => scroll('right')}>
                            <ArrowForwardIosOutlinedIcon />
                        </button>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    )
}

export default ProductDetail
