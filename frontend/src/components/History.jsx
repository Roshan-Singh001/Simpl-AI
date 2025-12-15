import React, { useState, useContext } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import { toast } from 'react-toastify';
import { v4 as uuidv4 } from "uuid";
import { authClient } from '../utils/auth_client';

// Icons
import { IoMdAdd } from "react-icons/io";
import { FaChevronLeft } from "react-icons/fa";
import { SlOptions } from "react-icons/sl";
import { FiEdit, FiTrash2 } from 'react-icons/fi';
import { MdDone } from "react-icons/md";
import { RxCross2 } from "react-icons/rx";

import { newChatContext } from '../context/contexts';
import { toghistoryContext } from '../context/toghistory';
import { ChatHistoryContext } from '../context/chathistory';
import { AllChatsContext } from '../context/chats';
import { ChatContext } from '../context/chatUnderstand';
import { ChatIndex } from '../context/chatIndex';
import { use } from 'react';

const AxiosInstance = axios.create({
  baseURL: 'http://localhost:3000/',
  timeout: 3000,
  headers: {'X-Custom-Header': 'foobar'}
});

const History = () => {
  const [Search, setSearch] = useState('');
  const {data: session} = authClient.useSession();
  const { chatSessions, setChatSessions } = useContext(ChatContext);
  const { chatIndex, setChatIndex } = useContext(ChatIndex);
  const [toggleSearch, settoggleSearch] = useState(false);
  const [SearchChatInstance, setSearchChatInstance] = useState([]);
  const [Instance_option, setInstance_option] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [editingInstance, setEditingInstance] = useState(null);
  const [newTopic, setNewTopic] = useState(''); 
  
  const genAI = new GoogleGenerativeAI(import.meta.env.VITE_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Context hooks (preserving your original naming)
  const { newChat: Chat, setNewChat: New_Chat } = useContext(newChatContext);
  const { togglehistory, setTogglehistory } = useContext(toghistoryContext);
  const { chatInstance, setChatInstance: set_instance } = useContext(ChatHistoryContext);
  const { chatai, setChatai: set_chats } = useContext(AllChatsContext);

  const notify = (message) => {
    toast.error(`${message}`, {
      theme: "dark",
    });
  };

  const handleSearch = (e) => {
    const search_value = e.target.value.toLowerCase();
    settoggleSearch(true);
    setSearch(search_value);
    
    if (search_value === "") {
      // If the search box is empty, reset the search results
      setSearchChatInstance([]);
      return;
    }
    
    const filteredChatInstances = chatInstance
      .filter((item) => item.topic.toLowerCase().includes(search_value))
      .map((item) => ({ id: item.id, topic: item.topic, is_active: false }));
    set_instance(filteredChatInstances);
  };

  const handleSearchCancel = async () => {
    settoggleSearch(false);
    setSearch('');
    try {
      const { data: instances_Data } = await AxiosInstance.get(`/chat/api/all_instance`,{
        headers: { 
          userId: session.user.id 
        }
      });
      instances_Data.forEach((row) => {
        delete row.timestamp;
      });
      const transformedInstanceData = instances_Data.map((instance) => ({
        id: instance.instance_id,
        topic: instance.topic_message,
        is_active: instance.active,
      }));
      set_instance(transformedInstanceData);
    } catch (error) {
      notify("Failed to load the data");
    }
    setSearchChatInstance([]);
  };

  const handleOptionsClick = (e, itemId) => {
    e.stopPropagation();
    const rect = e.target.getBoundingClientRect();
    setMenuPosition({
      top: rect.top + window.scrollY + rect.height ,
      left: rect.left + rect.width ,
    });
    setInstance_option(Instance_option === itemId ? null : itemId);
  };

  const handleChat = async (instance_id) => {
    New_Chat(true);
    const updatedInstances = chatInstance.map(item => ({
      ...item,
      is_active: item.id === instance_id
    }));
    set_instance(updatedInstances);
    
    try {
      const { data: chatData } = await AxiosInstance.get(`/chat/api/chat/${instance_id}`,{
        headers:{
          userId: session.user.id
        }
      });
      chatData.forEach((row) => {
        delete row.timestamp;
      });
      const normalized = chatData.map(row => ({
        id: row.chat_id,
        text: row.chat_message,
        isHuman: row.is_human,
      }));
      const geminiHistory = normalized.map(msg => ({
        role: msg.isHuman ? "user" : "model",
        parts: [{ text: msg.text }],
      }));

      const chat = model.startChat({
        history: geminiHistory,
        generationConfig: { maxOutputTokens: 500 },
      });
    
      // 4. Save Gemini chat object in state
      setChatSessions(prev => ({
        ...prev,
        [instance_id]: chat,
      }));

      const transformedChatData = chatData.map((chat) => ({
        id: chat.chat_id,
        message: chat.chat_message,
        isAi: !chat.is_human, 
      }));
      set_chats(transformedChatData);
      console.log(transformedChatData);

      const response = await AxiosInstance.get(`/chat/api/chat_index/${instance_id}`,{
        headers:{
          userId: session.user.id
        }
      });
      setChatIndex(response.data);
      console.log("Fetched chat index:", response.data);
    } catch (error) {
      notify("Failed to load chat data from the database");
    }
  };

  const handlenewchat = async () => {
    New_Chat(true);
    let n_id = uuidv4();
    const New_Chat_id = n_id.replaceAll("-", "_");
    
    try {
      await AxiosInstance.post(`/chat/api/newchat/${New_Chat_id}`,{
        userId: session.user.id,
      });
    } catch (error) {
      notify("Failed to save data in the database");
      return;
    }
    
    const updatedInstances = chatInstance.map(item => ({
      ...item,
      is_active: false
    }));
    
    set_instance([...updatedInstances, {
      id: New_Chat_id, 
      topic: "New Chat", 
      is_active: true
    }]);
    set_chats([]);
    
    try {
      await AxiosInstance.post(`/chat/api/instance/${New_Chat_id}`, {
        userId: session.user.id,
        topic: "New Chat", 
        is_active: true
      });
    } catch (error) {
      notify("Failed to create chat instance in the database");
    }
  };

  const handleInstanceDelete = async (instance_id) => {
    try {
      await AxiosInstance.post(`/chat/api/instance_delete/${instance_id}`,{
        userId: session.user.id,
      });
    } catch (error) {
      notify("Failed to delete chat from the database");
      return;
    }
    
    const instances = chatInstance.filter((item) => item.id !== instance_id);
    set_instance(instances);
    setInstance_option(null);
  };

  const handleInstanceEdit = (item) => {
    setEditingInstance(item.id);
    setNewTopic(item.topic);
    setInstance_option(null); 
  };

  const handleSaveEdit = async (itemId) => {
    const item = chatInstance.find(instance => instance.id === itemId);
    if (item && item.topic !== newTopic) {
      const updatedInstances = chatInstance.map(instance => 
        instance.id === itemId ? { ...instance, topic: newTopic } : instance
      );
      set_instance(updatedInstances);
      
      try {
        await AxiosInstance.post(`/chat/api/instance_topic/${itemId}`, { topic: newTopic, userId: session.user.id });
      } catch (error) {
        notify("Failed to save topic change in the database");
      }
    }
    setEditingInstance(null);
  };

  const handleCancelEdit = () => {
    setEditingInstance(null);
    setNewTopic('');
  };

  const handleTogHistory = () => {
    setTogglehistory(!togglehistory);
  };

  // Close options menu when clicking outside
  const handleOutsideClick = () => {
    setInstance_option(null);
  };

  return (
    <>
      {/* Overlay for mobile */}
      {togglehistory && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setTogglehistory(false)}
        />
      )}
      
      <section 
        className={`flex flex-col h-screen bg-black/95 backdrop-blur-lg border-r border-gray-700 text-white z-50 transform transition-all duration-300 ease-in-out ${
          togglehistory 
            ? 'translate-x-0 w-80 shadow-2xl' 
            : '-translate-x-full w-0 overflow-hidden'
        }`}
        onClick={handleOutsideClick}
      >
        {/* Header */}
        <div className='p-4 border-b border-gray-700 bg-black/50'>
          <div className='flex items-center justify-between mb-4'>
            <button 
              title='Hide History' 
              onClick={handleTogHistory} 
              className='p-2 bg-black hover:bg-gray-600 text-white rounded-lg transition-colors'
            >
              <FaChevronLeft />
            </button>
            <div className='text-lg font-bold tracking-wide'>CHAT HISTORY</div>
            <button 
              onClick={handlenewchat} 
              className='p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors shadow-lg hover:shadow-xl group'
              title="New Chat"
            >
              <IoMdAdd className='text-lg group-hover:rotate-90 transition-transform' />
            </button>
          </div>
          
          {/* Enhanced Search Bar */}
          <div className='relative'>
            <div className='flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-700/80 backdrop-blur-sm border border-gray-600 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all'>
              <input 
                value={Search}
                onChange={handleSearch}
                className='bg-transparent text-white placeholder-gray-400 outline-none w-full'
                type="search" 
                placeholder='Search conversations...' 
              />
              {toggleSearch && (
                <button 
                  onClick={handleSearchCancel} 
                  className='p-1 bg-red-500 hover:bg-red-600 rounded-full transition-colors' 
                  title="Clear search"
                > 
                  <RxCross2 className="text-sm" />
                </button>
              )}
            </div>
            
            {toggleSearch && (
              <div className='mt-2 text-xs text-gray-400 text-center'>
                {chatInstance.length} result{chatInstance.length !== 1 ? 's' : ''} found
              </div>
            )}
          </div>
        </div>
        
        {/* Chat List */}
        <div className='overflow-y-scroll h-[100vh]'>
          {toggleSearch && (
            <div className='p-3 border-b border-gray-700/50'>
              <div className='text-gray-400 text-xs uppercase tracking-wide text-center'>
                Search Results
              </div>
            </div>
          )}
          
          <div className='p-2'>
          {!session?<>
              <div className="text-red-400 text-sm text-center mb-4">Please login to view chat index.</div>
              

            </>:
            <>
            {(chatInstance.length === 0) && (
              <div className='flex flex-col items-center justify-center py-12 text-gray-500'>
                <div className='w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4'>
                  <IoMdAdd className='text-2xl' />
                </div>
                <div className='text-lg font-medium mb-1'>No Chats Yet</div>
                <div className='text-sm text-center px-4'>
                  Start a new conversation to begin chatting
                </div>
              </div>
            )}
            
            {chatInstance.map((item) => (
              <div 
                key={item.id} 
                onClick={(e) => {
                  e.stopPropagation();
                  handleChat(item.id);
                }}
                className={`flex items-center justify-between p-3 mb-2 rounded-xl cursor-pointer transition-all duration-200 group ${
                  item.is_active
                    ? 'bg-blue-600/20 border border-blue-500/50 shadow-lg'
                    : 'hover:bg-gray-800/60 border border-transparent'
                }`}
              >
                {/* Chat Topic */}
                <div className='pr-2'>
                  {editingInstance === item.id ? (
                    <div className='flex items-center gap-2'>
                      <input 
                        type="text" 
                        value={newTopic} 
                        onChange={(e) => setNewTopic(e.target.value)} 
                        onClick={(e) => e.stopPropagation()} 
                        className="w-[13rem] px-2 py-1 bg-gray-700 border border-gray-600 rounded-lg text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20" 
                        placeholder="Enter chat topic"
                        autoFocus
                      /> 
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); 
                          handleSaveEdit(item.id);
                        }} 
                        className="p-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors" 
                        title="Save changes"
                      > 
                        <MdDone className="text-sm" />
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation(); 
                          handleCancelEdit();
                        }} 
                        className="p-1.5 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors" 
                        title="Cancel editing"
                      > 
                        <RxCross2 className="text-sm" />
                      </button>
                    </div>
                  ) : (
                    <div className={`text-sm font-medium truncate transition-colors ${
                      item.is_active ? 'text-blue-300' : 'text-gray-300 group-hover:text-white'
                    }`}>
                      {item.topic}
                    </div>
                  )}
                </div>
                
                {/* Options Button */}
                {editingInstance !== item.id && (
                  <button 
                    onClick={(e) => handleOptionsClick(e, item.id)} 
                    className={`p-2 rounded-lg transition-all ${
                      Instance_option === item.id
                        ? 'bg-gray-700 text-white'
                        : 'opacity-0 group-hover:opacity-100 hover:bg-gray-700/50 text-gray-400 hover:text-white'
                    }`}
                    title="Chat options"
                  >
                    {Instance_option === item.id ? <RxCross2 /> : <SlOptions />}
                  </button>
                )}
                
                {/* Dropdown Menu */}
                {Instance_option === item.id && (
                  <div 
                    className="absolute p-[0.4rem] w-36 bg-gray-800/95 backdrop-blur-sm shadow-2xl rounded-xl z-20 border border-gray-600"
                    style={{ 
                      top: `${menuPosition.top}px`, 
                      left: `${menuPosition.left}px`,
                      transform: 'translateX(-50%)'
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button 
                      onClick={(e) => {
                        e.stopPropagation(); 
                        handleInstanceEdit(item);
                      }} 
                      className="flex items-center w-full px-3 py-2 text-sm rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      <FiEdit className="mr-2 text-blue-400" />
                      Edit Topic
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstanceDelete(item.id);
                      }} 
                      className="flex items-center w-full px-3 py-2 text-sm rounded-lg text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
                    >
                      <FiTrash2 className="mr-2" />
                      Delete Chat
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            </>
          }

          </div>
        </div>
      </section>
      
    </>
  );

}
export default History;