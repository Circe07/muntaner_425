
import { useState } from 'react'
import NavBar from '../NavBar/NavBar'
import Footer from '../Footer/Footer'
import './Claims.css'

const Claims = () => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        orderId: '',
        subject: '',
        message: ''
    })

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        // Here you would typically send the claim data
        console.log('Claim submitted:', formData)
        alert('Your claim has been received. We will get back to you shortly. (Demo)')
        setFormData({ name: '', email: '', orderId: '', subject: '', message: '' })
    }

    return (
        <>
            <NavBar />
            <div className="claims-page-wrapper">
                <div className="claims-container">
                    <div className="claims-header">
                        <h2>Shipping & Returns</h2>
                        <p>Need to return an item or file a claim? Fill out the form below and include your order number.</p>
                    </div>

                    <form className="claims-form" onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="name">Name</label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                placeholder="Your Name"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                required
                                placeholder="your@email.com"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="orderId">Order Number</label>
                            <input
                                type="text"
                                id="orderId"
                                name="orderId"
                                value={formData.orderId}
                                onChange={handleChange}
                                required
                                placeholder="e.g. #12345"
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="subject">Subject</label>
                            <select
                                id="subject"
                                name="subject"
                                value={formData.subject}
                                onChange={handleChange}
                                required
                            >
                                <option value="" disabled>Select an issue</option>
                                <option value="Return">Return Item</option>
                                <option value="Damaged">Damaged Item</option>
                                <option value="Shipping">Shipping Issue</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="message">Message</label>
                            <textarea
                                id="message"
                                name="message"
                                value={formData.message}
                                onChange={handleChange}
                                required
                                placeholder="Please describe the issue..."
                                rows="5"
                            ></textarea>
                        </div>

                        <button type="submit" className="submit-btn">Submit Claim</button>
                    </form>
                </div>
            </div>
            <Footer />
        </>
    )
}

export default Claims
