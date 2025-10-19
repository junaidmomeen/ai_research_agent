import React from 'react';

const SummaryRenderer = ({ summary }) => {
    if (!summary) {
        return null;
    }

    const renderContent = () => {
        const parts = summary.split('\n');
        return parts.map((part, index) => {
            part = part.trim();
            if (part.startsWith('- ') || part.startsWith('* ')) {
                return (
                    <li key={index} className="mb-2">
                        {part.substring(2)}
                    </li>
                );
            }
            if (part) {
                return (
                    <p key={index} className="mb-4">
                        {part}
                    </p>
                );
            }
            return null;
        });
    };

    const content = renderContent();
    const hasList = content.some(c => c && c.type === 'li');

    return (
        <div>
            {hasList ? <ul className="list-disc list-inside pl-4">{content}</ul> : content}
        </div>
    );
};

export default SummaryRenderer;
