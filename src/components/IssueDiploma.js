
import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import axios from 'axios';
import diplomaNFTAbi from '../DiplomaNFT.json';

const IssueDiploma = () => {
  const [form, setForm] = useState({
    studentName: '',
    studentID: '',
    institutionName: '',
    degree: '',
    image: null,
  });

  const [tokenId, setTokenId] = useState('');
  const [diplomaData, setDiplomaData] = useState(null);

  useEffect(() => {
    const loadWeb3 = async () => {
      if (window.ethereum) {
        window.web3 = new Web3(window.ethereum);
        try {
          await window.ethereum.enable();
        } catch (error) {
          console.error("User denied account access");
        }
      } else if (window.web3) {
        window.web3 = new Web3(window.web3.currentProvider);
      } else {
        console.log("Non-Ethereum browser detected. You should consider trying MetaMask!");
      }
    };
    loadWeb3();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e) => {
    setForm({ ...form, image: e.target.files[0] });
  };

  const handleTokenIdChange = (e) => {
    setTokenId(e.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Upload image to Pinata
      const formData = new FormData();
      formData.append('file', form.image);
      const imageResponse = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
        maxBodyLength: 'Infinity',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
          Authorization: `Bearer ${process.env.REACT_APP_PINATA_JWT}`,
        },
      });
      const imageHash = imageResponse.data.IpfsHash;

      console.log('Image uploaded to IPFS:', imageHash);

      // Create metadata and upload to Pinata
      const metadata = {
        studentName: form.studentName,
        studentID: form.studentID,
        institutionName: form.institutionName,
        degree: form.degree,
        image: `ipfs://${imageHash}`,
      };
      const metadataResponse = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.REACT_APP_PINATA_JWT}`,
        },
      });
      const metadataHash = metadataResponse.data.IpfsHash;

      console.log('Metadata uploaded to IPFS:', metadataHash);

      // Interact with smart contract
      const web3 = window.web3;
      const accounts = await web3.eth.getAccounts();
      const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
      const tx = await contract.methods
        .issueDiploma(
          form.studentName,
          form.studentID,
          form.institutionName,
          form.degree,
          metadataHash,
          `ipfs://${metadataHash}`
        )
        .send({ from: accounts[0] });

      const newTokenId = tx.events.DiplomaIssued.returnValues.tokenId; // Retrieve the token ID from the event log
      setTokenId(newTokenId); // Set the token ID state
      console.log('Diploma issued on blockchain with token ID:', newTokenId);
      alert(`Diploma issued successfully! Token ID: ${newTokenId}`);
    } catch (error) {
      console.error('Error issuing diploma:', error);
      alert('Failed to issue diploma');
    }
  };

  const handleRetrieve = async (e) => {
    e.preventDefault();
    try {
      const web3 = window.web3;
      const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
      const tokenURI = await contract.methods.getDiploma(tokenId).call();

      console.log('Retrieved tokenURI from blockchain:', tokenURI);

      // Fetch the metadata from IPFS
      const response = await axios.get(tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
      console.log('Retrieved metadata from IPFS:', response.data);
      setDiplomaData(response.data);
    } catch (error) {
      console.error('Error retrieving diploma:', error);
      alert('Failed to retrieve diploma');
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input type="text" name="studentName" value={form.studentName} onChange={handleChange} placeholder="Student Name" required />
        <input type="text" name="studentID" value={form.studentID} onChange={handleChange} placeholder="Student ID" required />
        <input type="text" name="institutionName" value={form.institutionName} onChange={handleChange} placeholder="Institution Name" required />
        <input type="text" name="degree" value={form.degree} onChange={handleChange} placeholder="Degree" required />
        <input type="file" name="image" onChange={handleFileChange} required />
        <button type="submit">Issue Diploma</button>
      </form>

      {tokenId && <p>Diploma issued successfully! Token ID: {tokenId}</p>}

      <hr />

      <form onSubmit={handleRetrieve}>
        <input type="text" value={tokenId} onChange={handleTokenIdChange} placeholder="Token ID" required />
        <button type="submit">Retrieve Diploma</button>

        {diplomaData && (
          <div>
            <h2>Diploma Details</h2>
            <p>Student Name: {diplomaData.studentName}</p>
            <p>Student ID: {diplomaData.studentID}</p>
            <p>Institution Name: {diplomaData.institutionName}</p>
            <p>Degree: {diplomaData.degree}</p>
            <img src={diplomaData.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="Diploma" />
          </div>
        )}
      </form>
    </div>
  );
};

export default IssueDiploma;



// import React, { useState, useEffect } from 'react';
// import Web3 from 'web3';
// import axios from 'axios';
// import diplomaNFTAbi from '../DiplomaNFT.json';

// const IssueDiploma = () => {
//   const [form, setForm] = useState({
//     studentName: '',
//     studentID: '',
//     institutionName: '',
//     degree: '',
//     image: null,
//   });

//   const [tokenId, setTokenId] = useState('');
//   const [diplomaData, setDiplomaData] = useState(null);

//   useEffect(() => {
//     const loadWeb3 = async () => {
//       if (window.ethereum) {
//         window.web3 = new Web3(window.ethereum);
//         try {
//           await window.ethereum.enable();
//         } catch (error) {
//           console.error("User denied account access");
//         }
//       } else if (window.web3) {
//         window.web3 = new Web3(window.web3.currentProvider);
//       } else {
//         console.log("Non-Ethereum browser detected. You should consider trying MetaMask!");
//       }
//     };
//     loadWeb3();
//   }, []);

//   const handleChange = (e) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };

//   const handleFileChange = (e) => {
//     setForm({ ...form, image: e.target.files[0] });
//   };

//   const handleTokenIdChange = (e) => {
//     setTokenId(e.target.value);
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       // Upload image to Pinata
//       const formData = new FormData();
//       formData.append('file', form.image);
//       const imageResponse = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
//         maxBodyLength: 'Infinity',
//         headers: {
//           'Content-Type': `multipart/form-data; boundary=${formData._boundary}`,
//           Authorization: `Bearer ${process.env.REACT_APP_PINATA_JWT}`,
//         },
//       });
//       const imageHash = imageResponse.data.IpfsHash;

//       console.log('Image uploaded to IPFS:', imageHash);

//       // Create metadata and upload to Pinata
//       const metadata = {
//         studentName: form.studentName,
//         studentID: form.studentID,
//         institutionName: form.institutionName,
//         degree: form.degree,
//         image: `ipfs://${imageHash}`,
//       };
//       const metadataResponse = await axios.post('https://api.pinata.cloud/pinning/pinJSONToIPFS', metadata, {
//         headers: {
//           'Content-Type': 'application/json',
//           Authorization: `Bearer ${process.env.REACT_APP_PINATA_JWT}`,
//         },
//       });
//       const metadataHash = metadataResponse.data.IpfsHash;

//       console.log('Metadata uploaded to IPFS:', metadataHash);

//       // Interact with smart contract
//       const web3 = window.web3;
//       const accounts = await web3.eth.getAccounts();
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods
//         .issueDiploma(
//           form.studentName,
//           form.studentID,
//           form.institutionName,
//           form.degree,
//           metadataHash,
//           `ipfs://${metadataHash}`
//         )
//         .send({ from: accounts[0] });

//       console.log('Diploma issued on blockchain');
//       alert('Diploma issued successfully!');
//     } catch (error) {
//       console.error('Error issuing diploma:', error);
//       alert('Failed to issue diploma');
//     }
//   };

//   const handleRetrieve = async (e) => {
//     e.preventDefault();
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       const tokenURI = await contract.methods.getDiploma(tokenId).call();

//       console.log('Retrieved tokenURI from blockchain:', tokenURI);

//       // Fetch the metadata from IPFS
//       const response = await axios.get(tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
//       console.log('Retrieved metadata from IPFS:', response.data);
//       setDiplomaData(response.data);
//     } catch (error) {
//       console.error('Error retrieving diploma:', error);
//       alert('Failed to retrieve diploma');
//     }
//   };

//   return (
//     <div>
//       <form onSubmit={handleSubmit}>
//         <input type="text" name="studentName" value={form.studentName} onChange={handleChange} placeholder="Student Name" required />
//         <input type="text" name="studentID" value={form.studentID} onChange={handleChange} placeholder="Student ID" required />
//         <input type="text" name="institutionName" value={form.institutionName} onChange={handleChange} placeholder="Institution Name" required />
//         <input type="text" name="degree" value={form.degree} onChange={handleChange} placeholder="Degree" required />
//         <input type="file" name="image" onChange={handleFileChange} required />
//         <button type="submit">Issue Diploma</button>
//       </form>

//       <hr />

//       <form onSubmit={handleRetrieve}>
//         <input type="text" value={tokenId} onChange={handleTokenIdChange} placeholder="Token ID" required />
//         <button type="submit">Retrieve Diploma</button>

//         {diplomaData && (
//           <div>
//             <h2>Diploma Details</h2>
//             <p>Student Name: {diplomaData.studentName}</p>
//             <p>Student ID: {diplomaData.studentID}</p>
//             <p>Institution Name: {diplomaData.institutionName}</p>
//             <p>Degree: {diplomaData.degree}</p>
//             <img src={diplomaData.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="Diploma" />
//           </div>
//         )}
//       </form>
//     </div>
//   );
// };

// export default IssueDiploma;
