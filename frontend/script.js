document.addEventListener('DOMContentLoaded', () => {
    // --- Page Elements ---
    const welcomeScreen = document.getElementById('welcome-screen');
    const startBtn = document.getElementById('start-btn');
    const chatContainer = document.getElementById('chat-container');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const chatBox = document.getElementById('chat-box');
    const backendUrl = 'https://socrates-ai-backend.onrender.com/api/chat';


    // --- State ---
    const initialAssistantMessage = "What is it you'd like to learn or understand today?";
    let chatHistory = [{ role: 'assistant', content: initialAssistantMessage }];

    // --- Event Listeners ---
    startBtn.addEventListener('click', () => {
        welcomeScreen.style.opacity = '0';
        setTimeout(() => {
            welcomeScreen.classList.add('hidden');
            chatContainer.classList.remove('hidden');
            chatContainer.style.animation = 'fadeIn 0.5s ease-out';
            displayMessage(initialAssistantMessage, 'assistant');
        }, 500);
    });

    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userMessage = userInput.value.trim();
        if (userMessage === '') return;

        displayMessage(userMessage, 'user');
        chatHistory.push({ role: 'user', content: userMessage });
        userInput.value = '';
        userInput.focus();

        const thinkingIndicator = displayMessage('Thinking...', 'assistant');

        try {
            const response = await fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    prompt: userMessage,
                    history: chatHistory.slice(0, -1)
                }),
            });
            
            chatBox.removeChild(thinkingIndicator);

            if (response.status === 429) {
                displayMessage("Free API limit reached for today. Please try again tomorrow.", 'assistant');
                chatHistory.push({ role: 'assistant', content: "Free API limit reached for today. Please try again tomorrow." });
                return;
            }
            if (!response.ok) {
                throw new Error(`Server error! status: ${response.status}`);
            }
            
            const assistantMessageElement = document.createElement('div');
            assistantMessageElement.classList.add('chat-message', 'assistant-message');
            chatBox.appendChild(assistantMessageElement);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullResponse = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value, { stream: true });
                fullResponse += chunk;
                assistantMessageElement.textContent = fullResponse;
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            
            chatHistory.push({ role: 'assistant', content: fullResponse });

        } catch (error) {
            console.error('Error fetching AI response:', error);
            const thinkingIndicator = document.querySelector('.thinking');
            if (thinkingIndicator) chatBox.removeChild(thinkingIndicator);
            displayMessage('Sorry, a connection error occurred. Please try again.', 'assistant');
        }
    });

    // --- Helper Functions ---
    function displayMessage(message, sender) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('chat-message', `${sender}-message`);

        if (sender === 'assistant' && message === 'Thinking...') {
            messageElement.classList.add('thinking');
            messageElement.innerHTML = '<span>.</span><span>.</span><span>.</span>';
        } else {
            messageElement.textContent = message;
        }

        chatBox.appendChild(messageElement);
        chatBox.scrollTop = chatBox.scrollHeight;
        return messageElement;
    }
});