import React, { useState, useEffect, useRef, useMemo, useContext } from "react";
import MainLogo from "../assets/images/MainLogo.png";
import axios from "axios";
import { toast } from "react-toastify";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authClient } from "../utils/auth_client";
import { v4 as uuidv4 } from "uuid";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import {
  FaChevronRight,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPaperPlane,
  FaPlus,
  FaHistory,
  FaRobot,
  FaUser,
  FaChevronLeft
} from "react-icons/fa";
import { CiCircleList } from "react-icons/ci";


import { newChatContext } from "../context/contexts";
import { toghistoryContext } from "../context/toghistory";
import { ChatHistoryContext } from "../context/chathistory";
import { AllChatsContext } from "../context/chats";
import { ChatContext } from "../context/chatUnderstand";
import { ChatIndex } from "../context/chatIndex";

import History from "../components/History";
import Chmarkdown from "../components/Chmarkdown";

const AxiosInstance = axios.create({
  baseURL: 'http://localhost:3000/',
  timeout: 3000,
  headers: { 'X-Custom-Header': 'foobar' }
});

const SimpleChat = () => {
  const [message, setMessage] = useState("");
  const { data: session } = authClient.useSession();
  const [chatai, setChatai] = useState([]);
  const { chatSessions, setChatSessions } = useContext(ChatContext);
  const { chatIndex, setChatIndex } = useContext(ChatIndex);

  const [chatInstance, setChatInstance] = useState([]);
  const [newChat, setnewChat] = useState(false);
  const [mictoggle, setMicToggle] = useState(false);
  const [togglehistory, setTogglehistory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [Index, setIndex] = useState(false);


  const textareaRef = useRef(null);
  const chatEndRef = useRef(null);
  const maxHeight = 120;

  // Initialize Gemini AI
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Context values
  const toghistoryContextValue = useMemo(
    () => ({ togglehistory, setTogglehistory }),
    [togglehistory]
  );

  const newChatContextValue = useMemo(
    () => ({ newChat, setNewChat: setnewChat }),
    [newChat]
  );

  const chatHistoryContextValue = useMemo(
    () => ({ chatInstance, setChatInstance }),
    [chatInstance]
  );

  const allChatsContextValue = useMemo(
    () => ({ chatai, setChatai }),
    [chatai]
  );

  const { transcript, browserSupportsSpeechRecognition } = useSpeechRecognition();

  useEffect(() => {
    const initializeChats = async () => {
      if (!session?.user?.id) return;

      console.log("Fetching chat instances for userId:", session?.user.id);
      console.log("Session data:", session);
      try {
        const { data: instances_Data } = await AxiosInstance.get(`/chat/api/all_instance`, {
          headers: {
            userId: session.user.id
          },
        });
        const transformedInstanceData = instances_Data.map((instance) => ({
          id: instance.instance_id,
          topic: instance.topic_message,
          is_active: instance.active,
        }));
        setChatInstance(transformedInstanceData);
      } catch (error) {
        console.error("Error fetching chat instances:", error);
        toast.error("Failed to fetch previous chats");
      }
    };

    initializeChats();
  }, [session]);

  // Handle speech recognition transcript
  useEffect(() => {
    if (transcript) {
      setMessage(transcript);
    }
  }, [transcript]);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatai]);

  const handleInput = (e) => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
    setMessage(e.target.value);
  };

  const handleMic = () => {
    if (!browserSupportsSpeechRecognition) {
      toast.error("Your browser doesn't support speech recognition");
      return;
    }

    setMicToggle(!mictoggle);
    if (!mictoggle) {
      SpeechRecognition.startListening({ continuous: true });
    } else {
      SpeechRecognition.stopListening();
    }
  };

  const handleTogHistory = () => {
    setTogglehistory(true);
  };

  const handleNewChat = async () => {
    setnewChat(true);
    let n_id = uuidv4();
    const New_Chat_id = n_id.replaceAll("-", "_");

    try {
      await AxiosInstance.post(`/chat/api/newchat/${New_Chat_id}`, {
        userId: session.user.id,
      });
    } catch (error) {
      console.log("Error creating new chat:", error);
      toast.error("Failed to save data in the database");
      return null;
    }

    const updatedInstances = chatInstance.map(item => ({
      ...item,
      is_active: false
    }));

    setChatInstance([
      ...updatedInstances,
      { id: New_Chat_id, topic: "New Chat", is_active: true }
    ]);

    setChatai([]);

    try {
      await AxiosInstance.post(`/chat/api/instance/${New_Chat_id}`, {
        userId: session.user.id,
        topic: "New Chat",
        is_active: false,
      });
    } catch (error) {
      toast.error("Failed to create chat instance in the database");
    }

    return New_Chat_id;
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!message.trim() || isLoading) return;

    const prompt = message.trim();
    setMessage("");
    setIsLoading(true);

    let chat_active_id = chatInstance.find(item => item.is_active)?.id || "";

    if (!chat_active_id) {
      chat_active_id = await handleNewChat();
      if (!chat_active_id) return;
    }

    const userMessageId = uuidv4();
    const userMessage = { id: userMessageId, message: prompt, isAi: false };
    setChatai(prev => [...prev, userMessage]);

    try {
      await AxiosInstance.post(`/chat/api/go/${chat_active_id}`, {
        userId: session.user.id,
        id: userMessageId,
        message: prompt,
        is_human: true,
      });
    } catch {
      toast.error("Failed to save user message");
    }

    try {
      let chat = chatSessions[chat_active_id];
      if (!chat) {
        chat = model.startChat({ history: [] });
        setChatSessions(prev => ({ ...prev, [chat_active_id]: chat }));
      }


      const result = await chat.sendMessage(prompt);
      const ai_result = result.response.text();

      const aiMessageId = uuidv4();
      const aiMessage = { id: aiMessageId, message: ai_result, isAi: true };
      setChatai(prev => [...prev, aiMessage]);


      try {
        await AxiosInstance.post(`/chat/api/go/${chat_active_id}`, {
          userId: session.user.id,
          id: aiMessageId,
          message: ai_result,
          is_human: false,
        });
      } catch {
        toast.error("Failed to save AI response");
      }

      // Update topic if this is the first message
      if (chatai.length === 0) {
        const topicPrompt = `Generate a concise 2-4 word topic for this conversation without using any special character. User: "${prompt}" AI: "${ai_result}"`;
        const topicResult = await chat.sendMessage(topicPrompt);
        const topic = topicResult.response.text().replace(/['"*]/g, '').trim();

        setChatInstance(prev => prev.map(item =>
          item.is_active ? { ...item, topic } : item
        ));

        await AxiosInstance.post(`/chat/api/instance_topic/${chat_active_id}`, { topic, userId: session.user.id });
      }

      const indexPrompt = `Generate a concise 2-4 word topic for this particular conversation without using any special characters like. User: "${prompt}" AI(You): "${ai_result}"`;
      const indexResult = await chat.sendMessage(indexPrompt);
      const index = indexResult.response.text().replace(/['"*]/g, '').trim();
      console.log("Index:", index);

      await AxiosInstance.post(`/chat/api/chat_index/${chat_active_id}`, { userMessageId, index: index || "General", userId: session.user.id });

      if (chatIndex.length > 0) {
        setChatIndex(prev => [...prev, { index_id: userMessageId, index_name: index || "General" }]);
        return;
      }
      else {
        setChatIndex([{ index_id: userMessageId, index_name: index || "General" }]);

      }
    } catch (error) {
      console.error("Error generating AI response:", error);
      toast.error("Failed to get AI response");

      setChatai(prev => [...prev, {
        id: uuidv4(),
        message: "Sorry, I encountered an error processing your request. Please try again.",
        isAi: true
      }]);
    } finally {
      setIsLoading(false);
    }
  };


  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const activeChat = chatInstance.find(item => item.is_active);

  return (
    <AllChatsContext.Provider value={allChatsContextValue}>
      <ChatHistoryContext.Provider value={chatHistoryContextValue}>
        <toghistoryContext.Provider value={toghistoryContextValue}>
          <newChatContext.Provider value={newChatContextValue}>
            <div className={`h-screen bg-black flex overflow-hidden`}>
              {/* History Sidebar */}
              <History />

              {/* Main Chat Area */}
              <div className={`flex-1 flex flex-col transition-all duration-300 ${togglehistory ? '' : 'ml-0'} ${Index ? "sm:mr-80" : "mr-0"}'}`}>
                {/* Header */}
                <div className="bg-black/50 backdrop-blur-sm border-b border-gray-700 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {!togglehistory && (
                        <button
                          onClick={handleTogHistory}
                          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        >
                          <FaChevronRight className="text-gray-400" />
                        </button>
                      )}
                      <div className="flex items-center gap-2">
                        <img className="w-10 h-10 sm:w-12 sm:h-12" src={MainLogo} alt="Simpl AI Logo" />
                        <h1 className="text-xl font-bold text-white">SIMPL-AI Chat</h1>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {activeChat && (
                        <span className="text-gray-300 text-sm bg-gray-700 px-3 py-1 rounded-full">
                          {activeChat.topic}
                        </span>
                      )}
                      <button
                        onClick={handleNewChat}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2"
                      >
                        <FaPlus className="text-sm" />
                        <span className="hidden sm:inline">New Chat</span>
                      </button>
                      {chatai.length > 0 && <button onClick={() => setIndex(true)} className="p-2 text-2xl bg-sky-400 text-white rounded-lg"><CiCircleList /></button>}

                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatai.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <div className="flex flex-col justify-center items-center  text-gray-400 max-w-md">
                        <img className="w-12 h-12 sm:w-[5rem] sm:h-[5rem]" src={MainLogo} alt="Simpl AI Logo" />
                        <h2 className="text-2xl font-bold mb-2">Welcome to SIMPL-AI Chat</h2>
                        <p className="text-center">Start a conversation by typing a message below. I'm here to help with any questions you have!</p>
                      </div>
                    </div>
                  )}

                  {chatai.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex ${item.isAi ? 'justify-start' : 'justify-end'} mb-4`}
                    >

                      <div className={`max-w-[80%] sm:max-w-[70%] p-4 rounded-2xl ${item.isAi
                        ? 'bg-gray-800/80 backdrop-blur-sm text-white border border-gray-700'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
                        }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {item.isAi ? (
                            <>
                              <FaRobot className="text-blue-400 text-sm" />
                              <span className="font-semibold text-blue-400 text-sm">SIMPL-AI</span>
                            </>
                          ) : (
                            <>
                              <FaUser className="text-blue-200 text-sm" />
                              <span className="font-semibold text-blue-200 text-sm">You</span>
                            </>
                          )}
                        </div>

                        <div className="text-sm leading-relaxed">
                          {item.isAi ? (
                            <Chmarkdown markdownStr={item.message} />
                          ) : (

                            <p id={`chat-${item.id}`}>{item.message}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {isLoading && (
                    <div className="flex justify-start mb-4">
                      <div className="max-w-[70%] p-4 rounded-2xl bg-gray-800/80 backdrop-blur-sm border border-gray-700">
                        <div className="flex items-center gap-2 mb-2">
                          <FaRobot className="text-blue-400 text-sm" />
                          <span className="font-semibold text-blue-400 text-sm">SIMPL-AI</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                          </div>
                          <span className="text-gray-400 text-sm">Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="bg-gray-800/50 backdrop-blur-sm border-t border-gray-700 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        rows={1}
                        value={message}
                        onChange={handleInput}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message..."
                        disabled={isLoading}
                        className="w-full p-4 bg-gray-700/80 backdrop-blur-sm text-white placeholder-gray-400 rounded-2xl border border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none outline-none"
                        style={{
                          height: "auto",
                          maxHeight: `${maxHeight}px`,
                          overflowY: textareaRef.current?.scrollHeight > maxHeight ? "auto" : "hidden",
                        }}
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleMic}
                        className={`p-3 rounded-xl transition-all ${mictoggle
                          ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          }`}
                      >
                        {mictoggle ? (
                          <FaMicrophone className="text-lg" />
                        ) : (
                          <FaMicrophoneSlash className="text-lg" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e)=>handleSubmit(e)}
                        disabled={!message.trim() || isLoading}
                        className="p-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-600 disabled:to-gray-700 text-white rounded-xl transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <FaPaperPlane className="text-lg" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 text-xs text-gray-500 text-center">
                    Press Enter to send, Shift+Enter for new line
                  </div>
                </div>
              </div>

              {Index && (
                <section
                  className={`
      bg-gray-900/95 backdrop-blur-xl border-l border-gray-700 text-white shadow-2xl flex flex-col
      transition-all duration-300 ease-in-out
      w-full sm:w-80
      ${Index ? "translate-x-0" : "translate-x-full sm:translate-x-0"}
      ${Index ? "fixed sm:relative top-0 right-0 h-screen" : "fixed sm:relative top-0 right-0 h-screen"}
    `}
                >
                  <div className="flex items-center justify-between mb-4 mt-3 p-2">
                    <button
                      title="Hide Index"
                      onClick={() => setIndex(false)}
                      className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                    >
                      <FaChevronRight />
                    </button>
                    <div className="text-lg font-bold tracking-wide m-auto">Chat Index</div>
                  </div>

                  <div className="h-screen overflow-y-auto p-3 ">
                    {chatIndex.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center mt-10">
                        No previous chats yet.
                      </p>
                    ) : (
                      chatIndex.map((chat) => (
                        <div
                          key={chat.index_id}
                          onClick={() => {
                            const el = document.getElementById(`chat-${chat.index_id}`);
                            if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); }
                          }
                          }
                          className={`flex items-center justify-between p-4 mb-2 rounded-xl cursor-pointer transition-all duration-200 group bg-gray-800/60 border border-transparent hover:bg-blue-600/20 hover:border-blue-500/50 hover:shadow-lg`}>
                          <p className="text-sm font-semibold truncate">{chat.index_name}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}

            </div>
          </newChatContext.Provider>
        </toghistoryContext.Provider>
      </ChatHistoryContext.Provider>
    </AllChatsContext.Provider>
  );
};

export default SimpleChat;