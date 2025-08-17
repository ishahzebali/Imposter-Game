import React from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, onSnapshot, updateDoc, collection, addDoc } from 'firebase/firestore';

// --- !!! IMPORTANT !!! ---
// This is a placeholder for the Firebase config.
// In a real environment, this would be provided securely.
const firebaseConfigString = typeof __firebase_config !== 'undefined' ? __firebase_config : JSON.stringify({
    apiKey: "AIzaSyAI-0lpgoYcXcgrlqHF_mIF9IqiaRqw1bY",
    authDomain: "imposter-game-f4e36.firebaseapp.com",
    projectId: "imposter-game-f4e36",
    storageBucket: "imposter-game-f4e36.appspot.com",
    messagingSenderId: "622941194586",
    appId: "1:622941194586:web:376be19c5d9de2e5eccb63",
    measurementId: "G-W7XJKDDCZK"
});
const firebaseConfig = JSON.parse(firebaseConfigString);

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-imposter-game';
const gamesCollectionPath = `artifacts/${appId}/public/data/games`;

// --- Word Lists ---
const wordList = [
    "Apple", "Banana", "Carrot", "Donut", "Eggplant", "Fig", "Grape", "Honeydew",
    "Internet", "Java", "Kiwi", "Lemon", "Mango", "Nectarine", "Orange", "Peach",
    "Quantum", "Raspberry", "Strawberry", "Tomato", "Ugli Fruit", "Vanilla", "Watermelon",
    "Xigua", "Yam", "Zucchini", "Sun", "Moon", "Star", "Planet", "Comet", "Galaxy",
    "Nebula", "Orbit", "Gravity", "Telescope", "Rocket", "Astronaut", "Alien", "Earth",
    "Mars", "Jupiter", "Saturn", "Venus", "Mercury", "Neptune", "Uranus", "Pluto",
    "Dog", "Cat", "Fish", "Bird", "Lion", "Tiger", "Bear", "Elephant", "Monkey",
    "Giraffe", "Zebra", "Kangaroo", "Penguin", "Dolphin", "Whale", "Shark", "Octopus",
    "Car", "Bicycle", "Motorcycle", "Bus", "Train", "Airplane", "Boat", "Submarine"
];

// --- Helper Functions ---
const getRandomWord = () => wordList[Math.floor(Math.random() * wordList.length)];

// --- React Components ---

// Displays a single player's info and their submitted word
const PlayerCard = ({ player, isCurrentPlayer, isRevealed, gameData, onVote, votedFor, canVote }) => {
    const word = gameData.words.find(w => w.uid === player.uid)?.word || '...';
    const hasVoted = gameData.votes && auth.currentUser && gameData.votes[auth.currentUser.uid];

    return (
        <div className={`p-4 rounded-lg shadow-md transition-all duration-300 ${isCurrentPlayer ? 'bg-yellow-200 ring-2 ring-yellow-500' : 'bg-white'}`}>
            <div className="flex items-center justify-between">
                <p className="font-bold text-gray-800">{player.name}</p>
                {isRevealed && (
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${player.role === 'imposter' ? 'bg-red-500 text-white' : 'bg-green-500 text-white'}`}>
                        {player.role.toUpperCase()}
                    </span>
                )}
            </div>
            <p className="text-2xl font-light text-gray-600 mt-2 h-10">{isRevealed || gameData.status === 'playing' ? word : '...'}</p>
            {gameData.status === 'voting' && canVote && !hasVoted && (
                <button
                    onClick={() => onVote(player.uid)}
                    disabled={votedFor}
                    className="mt-2 w-full bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                >
                    Vote
                </button>
            )}
            {votedFor && <p className="text-center mt-2 text-blue-600 font-semibold">Voted!</p>}
        </div>
    );
};

// Main Game Screen
const GameScreen = ({ gameData, gameId }) => {
    const [wordInput, setWordInput] = React.useState('');
    const [votedFor, setVotedFor] = React.useState(null);
    const currentUser = auth.currentUser;
    const myPlayer = gameData.players.find(p => p.uid === currentUser.uid);
    const isMyTurn = gameData.currentPlayerUid === currentUser.uid;
    const gameDocRef = doc(db, gamesCollectionPath, gameId);

    const handleSubmitWord = async () => {
        if (!wordInput.trim() || !isMyTurn) return;

        const newWords = [...gameData.words, { uid: currentUser.uid, name: myPlayer.name, word: wordInput.trim() }];
        const currentPlayerIndex = gameData.players.findIndex(p => p.uid === currentUser.uid);
        const nextPlayerIndex = (currentPlayerIndex + 1) % gameData.players.length;
        const nextPlayerUid = gameData.players[nextPlayerIndex].uid;

        let newStatus = gameData.status;
        // If the last player just went, move to voting
        if (newWords.length === gameData.players.length) {
            newStatus = 'voting';
        }

        await updateDoc(gameDocRef, {
            words: newWords,
            currentPlayerUid: nextPlayerUid,
            status: newStatus,
        });
        setWordInput('');
    };

    const handleVote = async (votedForUid) => {
        if (votedFor) return;
        setVotedFor(votedForUid);
        const newVotes = { ...gameData.votes, [currentUser.uid]: votedForUid };

        await updateDoc(gameDocRef, {
            votes: newVotes
        });

        // If everyone has voted, tally results
        if (Object.keys(newVotes).length === gameData.players.length) {
            tallyVotes(newVotes);
        }
    };
    
    const tallyVotes = async (votes) => {
        const voteCounts = {};
        Object.values(votes).forEach(votedForUid => {
            voteCounts[votedForUid] = (voteCounts[votedForUid] || 0) + 1;
        });

        let maxVotes = 0;
        let votedOutUid = null;
        for (const uid in voteCounts) {
            if (voteCounts[uid] > maxVotes) {
                maxVotes = voteCounts[uid];
                votedOutUid = uid;
            }
        }

        const imposter = gameData.players.find(p => p.role === 'imposter');
        const winner = votedOutUid === imposter.uid ? 'Crew' : 'Imposter';

        await updateDoc(gameDocRef, {
            status: 'finished',
            winner: winner,
            votedOutUid: votedOutUid,
        });
    };
    
    const handlePlayAgain = async () => {
        const host = gameData.players.find(p => p.isHost);
        if (currentUser.uid !== host.uid) return; // Only host can restart

        const newSecretWord = getRandomWord();
        const imposterIndex = Math.floor(Math.random() * gameData.players.length);
        const newPlayers = gameData.players.map((p, index) => ({
            ...p,
            role: index === imposterIndex ? 'imposter' : 'crew'
        }));

        await updateDoc(gameDocRef, {
            status: 'playing',
            secretWord: newSecretWord,
            players: newPlayers,
            words: [],
            votes: {},
            winner: null,
            votedOutUid: null,
            currentPlayerUid: gameData.players[0].uid, // Start with the first player
        });
    };

    const renderGameContent = () => {
        if (gameData.status === 'finished') {
            const imposter = gameData.players.find(p => p.role === 'imposter');
            const votedOutPlayer = gameData.players.find(p => p.uid === gameData.votedOutUid);

            return (
                <div className="text-center bg-white p-8 rounded-lg shadow-xl">
                    <h2 className="text-4xl font-bold mb-4">{gameData.winner} Wins!</h2>
                    <p className="text-xl mb-2">The secret word was: <span className="font-bold text-blue-600">{gameData.secretWord}</span></p>
                    <p className="text-xl mb-2">The imposter was: <span className="font-bold text-red-600">{imposter.name}</span></p>
                    <p className="text-xl mb-6">You voted out: <span className="font-bold text-gray-800">{votedOutPlayer?.name || 'Nobody'}</span></p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        {gameData.players.map(p => <PlayerCard key={p.uid} player={p} isRevealed={true} gameData={gameData} />)}
                    </div>
                    {myPlayer.isHost && (
                        <button onClick={handlePlayAgain} className="bg-green-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-colors text-lg">
                            Play Again
                        </button>
                    )}
                </div>
            );
        }

        return (
            <div>
                <div className="text-center mb-6">
                    <h2 className="text-2xl font-light text-gray-700">Your Word Is:</h2>
                    <p className="text-5xl font-bold text-blue-600">
                        {myPlayer.role === 'imposter' ? "???" : gameData.secretWord}
                    </p>
                    <p className="text-lg font-semibold mt-2 text-red-500">{myPlayer.role.toUpperCase()}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                    {gameData.players.map(p => {
                        const isCurrent = gameData.currentPlayerUid === p.uid;
                        return <PlayerCard 
                            key={p.uid} 
                            player={p} 
                            isCurrentPlayer={isCurrent && gameData.status === 'playing'} 
                            isRevealed={false} 
                            gameData={gameData}
                            onVote={handleVote}
                            votedFor={votedFor === p.uid}
                            canVote={p.uid !== currentUser.uid}
                        />
                    })}
                </div>

                {gameData.status === 'playing' && isMyTurn && (
                    <div className="mt-6 p-4 bg-white rounded-lg shadow-md">
                        <h3 className="text-xl font-bold text-center text-gray-800">It's your turn!</h3>
                        <div className="flex gap-2 mt-2">
                            <input
                                type="text"
                                value={wordInput}
                                onChange={(e) => setWordInput(e.target.value)}
                                placeholder="Enter your word..."
                                className="flex-grow p-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                onClick={handleSubmitWord}
                                className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Submit
                            </button>
                        </div>
                    </div>
                )}
                 {gameData.status === 'voting' && (
                    <div className="mt-6 p-4 bg-white rounded-lg shadow-md text-center">
                        <h3 className="text-2xl font-bold text-gray-800">Vote for the Imposter!</h3>
                        {!votedFor && <p className="text-gray-600">Click the vote button on a player's card.</p>}
                        {votedFor && <p className="text-gray-600">Waiting for other players to vote...</p>}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-gray-800">Imposter</h1>
                <div className="text-right">
                    <p className="text-gray-600">Game ID</p>
                    <p className="font-mono bg-gray-200 px-2 py-1 rounded">{gameId}</p>
                </div>
            </div>
            {renderGameContent()}
        </div>
    );
};

// Lobby Screen
const LobbyScreen = ({ gameData, gameId, userId }) => {
    const isHost = gameData.players.find(p => p.uid === userId)?.isHost;
    const gameDocRef = doc(db, gamesCollectionPath, gameId);

    const handleStartGame = async () => {
        if (!isHost || gameData.players.length < 2) return;

        const secretWord = getRandomWord();
        const imposterIndex = Math.floor(Math.random() * gameData.players.length);

        const playersWithRoles = gameData.players.map((player, index) => ({
            ...player,
            role: index === imposterIndex ? 'imposter' : 'crew'
        }));

        await updateDoc(gameDocRef, {
            status: 'playing',
            players: playersWithRoles,
            secretWord: secretWord,
            currentPlayerUid: gameData.players[0].uid // Start with the host
        });
    };

    const handleCopyGameId = () => {
        const tempInput = document.createElement('input');
        tempInput.value = gameId;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        // Replace alert with a more modern notification if possible
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
            <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg text-center">
                <h1 className="text-4xl font-bold text-gray-800 mb-2">Lobby</h1>
                <p className="text-gray-600 mb-4">Share the Game ID with your friends!</p>
                <div className="bg-gray-100 p-3 rounded-lg flex items-center justify-center gap-4 mb-6">
                    <p className="text-2xl font-mono text-gray-800">{gameId}</p>
                    <button onClick={handleCopyGameId} className="p-2 rounded-md bg-gray-200 hover:bg-gray-300">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 2a1 1 0 00-1 1v1H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 10-2 0v1H8V3a1 1 0 00-1-1zM5 7h10v9a1 1 0 01-1 1H6a1 1 0 01-1-1V7z" />
                          <path d="M8 2a1 1 0 00-1 1v1H5a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2h-2V3a1 1 0 10-2 0v1H8V3a1 1 0 00-1-1z" />
                        </svg>
                    </button>
                </div>

                <h2 className="text-2xl font-semibold text-gray-700 mb-3">Players ({gameData.players.length})</h2>
                <div className="space-y-2">
                    {gameData.players.map(player => (
                        <div key={player.uid} className="bg-gray-50 p-3 rounded-md text-left">
                            <p className="font-semibold text-gray-800">{player.name} {player.isHost ? '(Host)' : ''}</p>
                        </div>
                    ))}
                </div>

                {isHost && (
                    <button
                        onClick={handleStartGame}
                        disabled={gameData.players.length < 2}
                        className="mt-6 w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors text-lg"
                    >
                        Start Game {gameData.players.length < 2 ? '(Need 2+ players)' : ''}
                    </button>
                )}
                 {!isHost && (
                    <div className="mt-6 text-center">
                        <p className="text-gray-600">Waiting for the host to start the game...</p>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mt-2"></div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Home Screen for creating/joining games
const HomeScreen = ({ setGameId, setPlayerName, playerName }) => {
    const [joinGameId, setJoinGameId] = React.useState('');
    const gamesCollectionRef = collection(db, gamesCollectionPath);

    const handleCreateGame = async () => {
        if (!playerName.trim()) { return; }
        const user = auth.currentUser;
        if (!user) return;

        const newGameRef = doc(gamesCollectionRef);
        const newGameId = newGameRef.id.substring(0, 6).toUpperCase();
        
        const hostPlayer = {
            uid: user.uid,
            name: playerName,
            isHost: true
        };

        await setDoc(doc(db, gamesCollectionPath, newGameId), {
            gameId: newGameId,
            status: 'lobby',
            players: [hostPlayer],
            words: [],
            votes: {},
            createdAt: new Date(),
        });
        setGameId(newGameId);
    };

    const handleJoinGame = async () => {
        if (!playerName.trim() || !joinGameId.trim()) { return; }
        const user = auth.currentUser;
        if (!user) return;

        const gameRef = doc(db, gamesCollectionPath, joinGameId.toUpperCase());
        const gameSnap = await getDoc(gameRef);

        if (gameSnap.exists()) {
            const gameData = gameSnap.data();
            if (gameData.players.find(p => p.uid === user.uid)) {
                setGameId(joinGameId.toUpperCase());
                return;
            }

            const newPlayer = {
                uid: user.uid,
                name: playerName,
                isHost: false
            };

            await updateDoc(gameRef, {
                players: [...gameData.players, newPlayer]
            });
            setGameId(joinGameId.toUpperCase());
        } else {
            // Handle game not found
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
            <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-2xl shadow-lg">
                <div>
                    <h1 className="text-center text-4xl font-extrabold text-gray-900">Imposter</h1>
                    <p className="mt-2 text-center text-sm text-gray-600">A word game of deception</p>
                </div>
                <div className="space-y-6">
                    <div>
                        <label htmlFor="name" className="text-sm font-medium text-gray-700">Your Name</label>
                        <input
                            id="name"
                            type="text"
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value)}
                            placeholder="Enter your name"
                            className="mt-1 w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
                        <h2 className="text-lg font-semibold text-gray-800">Create a New Game</h2>
                        <button
                            onClick={handleCreateGame}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                            Create Game
                        </button>
                    </div>
                    <div className="space-y-4 p-4 border border-gray-200 rounded-lg">
                        <h2 className="text-lg font-semibold text-gray-800">Join an Existing Game</h2>
                        <input
                            type="text"
                            value={joinGameId}
                            onChange={(e) => setJoinGameId(e.target.value)}
                            placeholder="Enter Game ID"
                            maxLength="6"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                        />
                        <button
                            onClick={handleJoinGame}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            Join Game
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Main App Component
export default function App() {
    const [userId, setUserId] = React.useState(null);
    const [playerName, setPlayerName] = React.useState('');
    const [gameId, setGameId] = React.useState(null);
    const [gameData, setGameData] = React.useState(null);
    const [isLoading, setIsLoading] = React.useState(true);

    React.useEffect(() => {
        const authenticateUser = async () => {
            try {
                const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                if (initialAuthToken && auth.currentUser === null) {
                    await signInWithCustomToken(auth, initialAuthToken);
                } else if (auth.currentUser === null) {
                    await signInAnonymously(auth);
                }
            } catch (error) {
                console.error("Authentication failed:", error);
                if (!auth.currentUser) {
                    await signInAnonymously(auth);
                }
            }
        };

        const unsub = onAuthStateChanged(auth, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsLoading(false);
            }
        });

        authenticateUser();

        return () => unsub();
    }, []);

    React.useEffect(() => {
        // Listen to game state changes if we are in a game
        if (!gameId) {
            setGameData(null);
            return;
        };

        const gameDocRef = doc(db, gamesCollectionPath, gameId);
        const unsub = onSnapshot(gameDocRef, (doc) => {
            if (doc.exists()) {
                setGameData(doc.data());
            } else {
                // Game was deleted or ID is wrong
                setGameId(null);
            }
        });

        return () => unsub();
    }, [gameId]);

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-100"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>;
    }

    if (!gameId || !gameData) {
        return <HomeScreen setGameId={setGameId} setPlayerName={setPlayerName} playerName={playerName} />;
    }

    if (gameData.status === 'lobby') {
        return <LobbyScreen gameData={gameData} gameId={gameId} userId={userId} />;
    }

    return <GameScreen gameData={gameData} gameId={gameId} />;
}
