import { useEffect, useState } from 'react'
import './ProductModal.css'
import ClearOutlinedIcon from '@mui/icons-material/ClearOutlined';
import EuroOutlinedIcon from '@mui/icons-material/EuroOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';

const ProductModal = ({ product, closeModal, addToCart }) => {
    const [quantity, setQuantity] = useState(1);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, []);

    const increaseQuantity = () => {
        setQuantity(prev => prev + 1);
    };

    const decreaseQuantity = () => {
        setQuantity(prev => (prev > 1 ? prev - 1 : 1));
    };

    if (!product) return null;

    return (
        <div className="modal-overlay" onClick={closeModal}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <button className="modal-close-btn" onClick={closeModal}>
                    <ClearOutlinedIcon />
                </button>
                <div className="modal-body">
                    <div className="modal-image-container">
                        <img src={product.img} alt={product.name} />
                    </div>
                    <div className="modal-details">
                        <div className="modal-header">
                            <h2>{product.name}</h2>
                        </div>
                        <p className="modal-description">{product.description}</p>

                        <div className="modal-footer">
                            <div className="modal-price-container">
                                <span className="modal-price">{product.price}<EuroOutlinedIcon style={{ fontSize: '0.9em' }} /></span>
                            </div>

                            <div className="modal-actions">
                                <div className="quantity-selector">
                                    <button onClick={decreaseQuantity}>-</button>
                                    <span>{quantity}</span>
                                    <button onClick={increaseQuantity}>+</button>
                                </div>
                                <button className="modal-add-btn" onClick={() => {
                                    addToCart(product, quantity);
                                    closeModal();
                                }}>
                                    AÑADIR A LA CESTA
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ProductModal
