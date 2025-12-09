'use client';

import { useState, useEffect } from 'react';

interface FAQItem {
    question: string;
    answer: string;
}

export default function AdminFAQ() {
    const [faqs, setFaqs] = useState<FAQItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [config, setConfig] = useState<any>({});

    useEffect(() => {
        fetch('/api/admin/site-config')
            .then(res => res.json())
            .then(data => {
                setConfig(data);
                setFaqs(data.faqs || []);
            });
    }, []);

    const saveConfig = async (newFaqs: FAQItem[]) => {
        setLoading(true);
        setMessage('');
        const newConfig = { ...config, faqs: newFaqs };

        try {
            const res = await fetch('/api/admin/site-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig),
            });

            if (res.ok) {
                setMessage('FAQs updated successfully!');
                setFaqs(newFaqs);
                setConfig(newConfig);
            } else {
                setMessage('Failed to update.');
            }
        } catch (err) {
            console.error(err);
            setMessage('An error occurred.');
        } finally {
            setLoading(false);
        }
    };

    const handleAdd = () => {
        const newFaqs = [...faqs, { question: 'New Question', answer: 'New Answer' }];
        saveConfig(newFaqs);
    };

    const checkDelete = (index: number) => {
        if (confirm('Are you sure you want to delete this Q&A?')) {
            const newFaqs = faqs.filter((_, i) => i !== index);
            saveConfig(newFaqs);
        }
    };

    const checkMoveUp = (index: number) => {
        if (index === 0) return;
        const newFaqs = [...faqs];
        const temp = newFaqs[index - 1];
        newFaqs[index - 1] = newFaqs[index];
        newFaqs[index] = temp;
        saveConfig(newFaqs);
    };

    const checkMoveDown = (index: number) => {
        if (index === faqs.length - 1) return;
        const newFaqs = [...faqs];
        const temp = newFaqs[index + 1];
        newFaqs[index + 1] = newFaqs[index];
        newFaqs[index] = temp;
        saveConfig(newFaqs);
    };

    const handleChange = (index: number, field: keyof FAQItem, value: string) => {
        const newFaqs = [...faqs];
        newFaqs[index] = { ...newFaqs[index], [field]: value };
        setFaqs(newFaqs);
    };

    const handleBlur = () => {
        // Save on blur to avoid too many requests, or just rely on a save button?
        // For reordering/adding/deleting we save immediately.
        // For text editing, let's have a manual save button at the top or bottom, 
        // OR just save when the user is done with a field?
        // To keep it simple and consistent with previous pages, let's use a manual "Save Changes" button for text edits
        // but reordering saves immediately.
    };

    // Actually, for consistency with the Schedule page pattern (if I recall correctly), I might have done immediate saves or a big form. 
    // Let's use a "Save All Changes" button for text edits to be safe and efficient.

    return (
        <div className="max-w-4xl">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Q&A / FAQ Management</h1>
                <button
                    onClick={() => saveConfig(faqs)}
                    disabled={loading}
                    className="py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-accent hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-50 transition-colors"
                >
                    {loading ? 'Saving...' : 'Save All Changes'}
                </button>
            </div>

            {message && (
                <div className={`p-4 rounded-md mb-6 ${message.includes('success') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                    {message}
                </div>
            )}

            <div className="space-y-6">
                {faqs.map((faq, index) => (
                    <div key={index} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 relative group">
                        <div className="absolute top-4 right-4 flex space-x-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => checkMoveUp(index)}
                                disabled={index === 0}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                title="Move Up"
                            >
                                ↑
                            </button>
                            <button
                                onClick={() => checkMoveDown(index)}
                                disabled={index === faqs.length - 1}
                                className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                                title="Move Down"
                            >
                                ↓
                            </button>
                            <button
                                onClick={() => checkDelete(index)}
                                className="p-1 text-red-400 hover:text-red-600"
                                title="Delete"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                            </button>
                        </div>

                        <div className="grid gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Question</label>
                                <input
                                    type="text"
                                    value={faq.question}
                                    onChange={(e) => handleChange(index, 'question', e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Answer</label>
                                <textarea
                                    rows={3}
                                    value={faq.answer}
                                    onChange={(e) => handleChange(index, 'answer', e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-accent focus:ring-accent sm:text-sm p-2 border text-gray-900"
                                />
                            </div>
                        </div>
                    </div>
                ))}

                <button
                    onClick={handleAdd}
                    className="w-full py-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-accent hover:text-accent transition-colors flex items-center justify-center font-medium"
                >
                    + Add New Question
                </button>
            </div>
        </div>
    );
}
