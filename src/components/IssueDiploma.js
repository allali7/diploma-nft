import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import axios from 'axios';
import diplomaNFTAbi from '../DiplomaNFT.json';
import { Container, Form, Button, Alert, Card, Row, Col } from 'react-bootstrap';
import TrustCertLogo from './TrustCertLogo.png';

const IssueDiploma = () => {
  const [form, setForm] = useState({
    studentName: '',
    studentID: '',
    institutionName: '',
    degree: '',
    image: null,
    requesterInstitutionName: '',
    requesterInstitutionID: '',
  });

  const [tokenId, setTokenId] = useState('');
  const [diplomaData, setDiplomaData] = useState(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [account, setAccount] = useState('');
  const [pendingRequests, setPendingRequests] = useState([]);
  const [isAuthorizedIssuer, setIsAuthorizedIssuer] = useState(false);

  useEffect(() => {
    const loadWeb3 = async () => {
      if (window.ethereum) {
        window.web3 = new Web3(window.ethereum);
        try {
          await window.ethereum.enable();
          const accounts = await window.web3.eth.getAccounts();
          setAccount(accounts[0]);
          await checkAuthorizedIssuer(accounts[0]);
          await fetchPendingRequests();
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

  const checkAuthorizedIssuer = async (account) => {
    const web3 = window.web3;
    const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
    const isAuthorized = await contract.methods.authorizedIssuers(account).call();
    setIsAuthorizedIssuer(isAuthorized.isActive);
  };

  const fetchPendingRequests = async () => {
    const web3 = window.web3;
    const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
    const requestIds = await contract.methods.getPendingRequestIds().call();
    const requests = await Promise.all(requestIds.map(async (requestId) => {
      const request = await contract.methods.issuerRequests(requestId).call();
      return { requestId, ...request };
    }));
    setPendingRequests(requests);
  };

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

  const handleRequestAuthorization = async () => {
    if (isAuthorizedIssuer) {
      setRequestMessage('You are already an authorized issuer.');
      return;
    }

    try {
      const web3 = window.web3;
      const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
      await contract.methods.requestAuthorization(form.requesterInstitutionName, form.requesterInstitutionID).send({ from: account, value: Web3.utils.toWei('0.001', 'ether') });
      setRequestMessage('Authorization request submitted successfully.');
      await fetchPendingRequests(); // Refresh the pending requests
    } catch (error) {
      console.error('Error requesting authorization:', error);
      setRequestMessage('Failed to submit authorization request.');
    }
  };

  const handleVoteOnRequest = async (requestIds, approve) => {
    try {
      const web3 = window.web3;
      const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
      await Promise.all(requestIds.map(async (requestId) => {
        await contract.methods.voteOnIssuerRequest(requestId, approve).send({ from: account });
      }));
      await fetchPendingRequests(); // Refresh the pending requests
    } catch (error) {
      console.error('Error voting on request:', error);
    }
  };

  return (
    <Container>
      <img src={TrustCertLogo} alt="TrustCert Logo" className="logo" />
      <Row>
        <Col>
          <Card className="mt-4">
            <Card.Body>
              <Card.Title>Issue Diploma</Card.Title>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Student Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="studentName"
                    value={form.studentName}
                    onChange={handleChange}
                    placeholder="Student Name"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Student ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="studentID"
                    value={form.studentID}
                    onChange={handleChange}
                    placeholder="Student ID"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Institution Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="institutionName"
                    value={form.institutionName}
                    onChange={handleChange}
                    placeholder="Institution Name"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Degree</Form.Label>
                  <Form.Control
                    type="text"
                    name="degree"
                    value={form.degree}
                    onChange={handleChange}
                    placeholder="Degree"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Diploma Image</Form.Label>
                  <Form.Control
                    type="file"
                    name="image"
                    onChange={handleFileChange}
                    required
                  />
                </Form.Group>
                <Button variant="primary" type="submit">Issue Diploma</Button>
              </Form>
              {tokenId && <Alert variant="success" className="mt-3">Diploma issued successfully! Token ID: {tokenId}</Alert>}
            </Card.Body>
          </Card>
        </Col>
        <Col>
          <Card className="mt-4">
            <Card.Body>
              <Card.Title>Retrieve Diploma</Card.Title>
              <Form onSubmit={handleRetrieve}>
                <Form.Group className="mb-3">
                  <Form.Label>Token ID</Form.Label>
                  <Form.Control
                    type="text"
                    value={tokenId}
                    onChange={handleTokenIdChange}
                    placeholder="Token ID"
                    required
                  />
                </Form.Group>
                <Button variant="primary" type="submit">Retrieve Diploma</Button>
              </Form>
              {diplomaData && (
                <div className="mt-3">
                  <h5>Diploma Details</h5>
                  <p><strong>Student Name:</strong> {diplomaData.studentName}</p>
                  <p><strong>Student ID:</strong> {diplomaData.studentID}</p>
                  <p><strong>Institution Name:</strong> {diplomaData.institutionName}</p>
                  <p><strong>Degree:</strong> {diplomaData.degree}</p>
                  <img src={diplomaData.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="Diploma" className="img-fluid" />
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Card className="mt-4">
        <Card.Body>
          <Card.Title>Request Issuer Authorization</Card.Title>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Institution Name</Form.Label>
              <Form.Control
                type="text"
                name="requesterInstitutionName"
                value={form.requesterInstitutionName}
                onChange={handleChange}
                placeholder="Institution Name"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Institution ID</Form.Label>
              <Form.Control
                type="text"
                name="requesterInstitutionID"
                value={form.requesterInstitutionID}
                onChange={handleChange}
                placeholder="Institution ID"
                required
              />
            </Form.Group>
            <Button onClick={handleRequestAuthorization}>Request Authorization</Button>
          </Form>
          {requestMessage && <Alert variant="info" className="mt-3">{requestMessage}</Alert>}
        </Card.Body>
      </Card>
      {isAuthorizedIssuer && (
        <Card className="mt-4">
          <Card.Body>
            <Card.Title>Pending Requests</Card.Title>
            {pendingRequests.length === 0 ? (
              <Alert variant="info">No pending requests</Alert>
            ) : (
              <Form>
                {pendingRequests.map((request) => (
                  <div key={request.requestId}>
                    <Form.Check
                      type="checkbox"
                      label={`Requester: ${request.requester}, Institution: ${request.institutionName}, ID: ${request.institutionID}`}
                      id={request.requestId}
                    />
                  </div>
                ))}
                <Button variant="success" className="mt-3" onClick={() => handleVoteOnRequest(pendingRequests.map(req => req.requestId), true)}>Approve Selected</Button>
                <Button variant="danger" className="mt-3 ms-3" onClick={() => handleVoteOnRequest(pendingRequests.map(req => req.requestId), false)}>Reject Selected</Button>
              </Form>
            )}
          </Card.Body>
        </Card>
      )}
    </Container>
  );
};

export default IssueDiploma;






// import React, { useState, useEffect } from 'react';
// import Web3 from 'web3';
// import axios from 'axios';
// import diplomaNFTAbi from '../DiplomaNFT.json';
// import { Container, Form, Button, Alert, Card, Row, Col } from 'react-bootstrap';
// import TrustCertLogo from './TrustCertLogo.png'; // Import the logo
// import '../IssueDiploma.css'; 

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
//   const [requestMessage, setRequestMessage] = useState('');
//   const [account, setAccount] = useState('');
//   const [pendingRequests, setPendingRequests] = useState([]);
//   const [isAuthorizedIssuer, setIsAuthorizedIssuer] = useState(false);

//   useEffect(() => {
//     const loadWeb3 = async () => {
//       if (window.ethereum) {
//         window.web3 = new Web3(window.ethereum);
//         try {
//           await window.ethereum.enable();
//           const accounts = await window.web3.eth.getAccounts();
//           setAccount(accounts[0]);
//           await checkAuthorizedIssuer(accounts[0]);
//           await fetchPendingRequests();
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

//   const checkAuthorizedIssuer = async (account) => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const isAuthorized = await contract.methods.authorizedIssuers(account).call();
//     setIsAuthorizedIssuer(isAuthorized.isActive);
//   };

//   const fetchPendingRequests = async () => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const requestIds = await contract.methods.getPendingRequestIds().call();
//     const requests = await Promise.all(requestIds.map(async (requestId) => {
//       const request = await contract.methods.issuerRequests(requestId).call();
//       return { requestId, ...request };
//     }));
//     setPendingRequests(requests);
//   };

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
//       const tx = await contract.methods
//         .issueDiploma(
//           form.studentName,
//           form.studentID,
//           form.institutionName,
//           form.degree,
//           metadataHash,
//           `ipfs://${metadataHash}`
//         )
//         .send({ from: accounts[0] });

//       const newTokenId = tx.events.DiplomaIssued.returnValues.tokenId; // Retrieve the token ID from the event log
//       setTokenId(newTokenId); // Set the token ID state
//       console.log('Diploma issued on blockchain with token ID:', newTokenId);
//       alert(`Diploma issued successfully! Token ID: ${newTokenId}`);
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

//   const handleRequestAuthorization = async () => {
//     if (isAuthorizedIssuer) {
//       setRequestMessage('You are already an authorized issuer.');
//       return;
//     }

//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.requestAuthorization().send({ from: account, value: Web3.utils.toWei('0.001', 'ether') });
//       setRequestMessage('Authorization request submitted successfully.');
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error requesting authorization:', error);
//       setRequestMessage('Failed to submit authorization request.');
//     }
//   };

//   const handleVoteOnRequest = async (requestId, approve) => {
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.voteOnIssuerRequest(requestId, approve).send({ from: account });
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error voting on request:', error);
//     }
//   };

//   return (
//     <Container>
//       <img src={TrustCertLogo} alt="TrustCert Logo" className="logo" />
//       <Row>
//         <Col>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Issue Diploma</Card.Title>
//               <Form onSubmit={handleSubmit}>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentName"
//                     value={form.studentName}
//                     onChange={handleChange}
//                     placeholder="Student Name"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student ID</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentID"
//                     value={form.studentID}
//                     onChange={handleChange}
//                     placeholder="Student ID"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Institution Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="institutionName"
//                     value={form.institutionName}
//                     onChange={handleChange}
//                     placeholder="Institution Name"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Degree</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="degree"
//                     value={form.degree}
//                     onChange={handleChange}
//                     placeholder="Degree"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Diploma Image</Form.Label>
//                   <Form.Control
//                     type="file"
//                     name="image"
//                     onChange={handleFileChange}
//                     required
//                   />
//                 </Form.Group>
//                 <Button variant="primary" type="submit">Issue Diploma</Button>
//               </Form>
//               {tokenId && <Alert variant="success" className="mt-3">Diploma issued successfully! Token ID: {tokenId}</Alert>}
//             </Card.Body>
//           </Card>
//         </Col>
//         <Col>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Retrieve Diploma</Card.Title>
//               <Form onSubmit={handleRetrieve}>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Token ID</Form.Label>
//                   <Form.Control
//                     type="text"
//                     value={tokenId}
//                     onChange={handleTokenIdChange}
//                     placeholder="Token ID"
//                     required
//                   />
//                 </Form.Group>
//                 <Button variant="primary" type="submit">Retrieve Diploma</Button>
//               </Form>
//               {diplomaData && (
//                 <div className="mt-3">
//                   <h5>Diploma Details</h5>
//                   <p><strong>Student Name:</strong> {diplomaData.studentName}</p>
//                   <p><strong>Student ID:</strong> {diplomaData.studentID}</p>
//                   <p><strong>Institution Name:</strong> {diplomaData.institutionName}</p>
//                   <p><strong>Degree:</strong> {diplomaData.degree}</p>
//                   <img src={diplomaData.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="Diploma" className="img-fluid" />
//                 </div>
//               )}
//             </Card.Body>
//           </Card>
//         </Col>
//       </Row>
//       <Card className="mt-4">
//         <Card.Body>
//           <Card.Title>Request Issuer Authorization</Card.Title>
//           <Button onClick={handleRequestAuthorization}>Request Authorization</Button>
//           {requestMessage && <Alert variant="info" className="mt-3">{requestMessage}</Alert>}
//         </Card.Body>
//       </Card>
//       {isAuthorizedIssuer && (
//         <Card className="mt-4">
//           <Card.Body>
//             <Card.Title>Pending Requests</Card.Title>
//             {pendingRequests.length === 0 ? (
//               <Alert variant="info">No pending requests</Alert>
//             ) : (
//               pendingRequests.map((request) => (
//                 <div key={request.requestId}>
//                   <p><strong>Requester:</strong> {request.requester}</p>
//                   <p><strong>Approvals:</strong> {request.approvals}</p>
//                   <p><strong>Rejections:</strong> {request.rejections}</p>
//                   <Button variant="success" className="me-2" onClick={() => handleVoteOnRequest(request.requestId, true)}>Approve</Button>
//                   <Button variant="danger" onClick={() => handleVoteOnRequest(request.requestId, false)}>Reject</Button>
//                   <hr />
//                 </div>
//               ))
//             )}
//           </Card.Body>
//         </Card>
//       )}
//     </Container>
//   );
// };

// export default IssueDiploma;










// import React, { useState, useEffect } from 'react';
// import Web3 from 'web3';
// import axios from 'axios';
// import diplomaNFTAbi from '../DiplomaNFT.json';
// import { Container, Form, Button, Alert, Card, Row, Col } from 'react-bootstrap';
// import TrustCertLogo from './TrustCertLogo.png'; // Import the logo
// 
// 
// const IssueDiploma = () => {
//   const [form, setForm] = useState({
//     studentName: '',
//     studentID: '',
//     institutionName: '',
//     degree: '',
//     image: null,
//   });
// 
//   const [tokenId, setTokenId] = useState('');
//   const [diplomaData, setDiplomaData] = useState(null);
//   const [requestMessage, setRequestMessage] = useState('');
//   const [account, setAccount] = useState('');
//   const [pendingRequests, setPendingRequests] = useState([]);
//   const [isAuthorizedIssuer, setIsAuthorizedIssuer] = useState(false);
// 
//   useEffect(() => {
//     const loadWeb3 = async () => {
//       if (window.ethereum) {
//         window.web3 = new Web3(window.ethereum);
//         try {
//           await window.ethereum.enable();
//           const accounts = await window.web3.eth.getAccounts();
//           setAccount(accounts[0]);
//           await checkAuthorizedIssuer(accounts[0]);
//           await fetchPendingRequests();
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
// 
//   const checkAuthorizedIssuer = async (account) => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const isAuthorized = await contract.methods.authorizedIssuers(account).call();
//     setIsAuthorizedIssuer(isAuthorized.isActive);
//   };
// 
//   const fetchPendingRequests = async () => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const requestIds = await contract.methods.getPendingRequestIds().call();
//     const requests = await Promise.all(requestIds.map(async (requestId) => {
//       const request = await contract.methods.issuerRequests(requestId).call();
//       return { requestId, ...request };
//     }));
//     setPendingRequests(requests);
//   };
// 
//   const handleChange = (e) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };
// 
//   const handleFileChange = (e) => {
//     setForm({ ...form, image: e.target.files[0] });
//   };
// 
//   const handleTokenIdChange = (e) => {
//     setTokenId(e.target.value);
//   };
// 
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
// 
//       console.log('Image uploaded to IPFS:', imageHash);
// 
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
// 
//       console.log('Metadata uploaded to IPFS:', metadataHash);
// 
//       // Interact with smart contract
//       const web3 = window.web3;
//       const accounts = await web3.eth.getAccounts();
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       const tx = await contract.methods
//         .issueDiploma(
//           form.studentName,
//           form.studentID,
//           form.institutionName,
//           form.degree,
//           metadataHash,
//           `ipfs://${metadataHash}`
//         )
//         .send({ from: accounts[0] });
// 
//       const newTokenId = tx.events.DiplomaIssued.returnValues.tokenId; // Retrieve the token ID from the event log
//       setTokenId(newTokenId); // Set the token ID state
//       console.log('Diploma issued on blockchain with token ID:', newTokenId);
//       alert(`Diploma issued successfully! Token ID: ${newTokenId}`);
//     } catch (error) {
//       console.error('Error issuing diploma:', error);
//       alert('Failed to issue diploma');
//     }
//   };
// 
//   const handleRetrieve = async (e) => {
//     e.preventDefault();
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       const tokenURI = await contract.methods.getDiploma(tokenId).call();
// 
//       console.log('Retrieved tokenURI from blockchain:', tokenURI);
// 
//       // Fetch the metadata from IPFS
//       const response = await axios.get(tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
//       console.log('Retrieved metadata from IPFS:', response.data);
//       setDiplomaData(response.data);
//     } catch (error) {
//       console.error('Error retrieving diploma:', error);
//       alert('Failed to retrieve diploma');
//     }
//   };
// 
//   const handleRequestAuthorization = async () => {
//     if (isAuthorizedIssuer) {
//       setRequestMessage('You are already an authorized issuer.');
//       return;
//     }
// 
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.requestAuthorization().send({ from: account, value: Web3.utils.toWei('0.001', 'ether') });
//       setRequestMessage('Authorization request submitted successfully.');
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error requesting authorization:', error);
//       setRequestMessage('Failed to submit authorization request.');
//     }
//   };
// 
//   const handleVoteOnRequest = async (requestId, approve) => {
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.voteOnIssuerRequest(requestId, approve).send({ from: account });
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error voting on request:', error);
//     }
//   };
// 
//   return (
//     <Container>
//       <Row>
//         <Col>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Issue Diploma</Card.Title>
//               <Form onSubmit={handleSubmit}>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentName"
//                     value={form.studentName}
//                     onChange={handleChange}
//                     placeholder="Student Name"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student ID</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentID"
//                     value={form.studentID}
//                     onChange={handleChange}
//                     placeholder="Student ID"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Institution Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="institutionName"
//                     value={form.institutionName}
//                     onChange={handleChange}
//                     placeholder="Institution Name"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Degree</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="degree"
//                     value={form.degree}
//                     onChange={handleChange}
//                     placeholder="Degree"
//                     required
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Diploma Image</Form.Label>
//                   <Form.Control
//                     type="file"
//                     name="image"
//                     onChange={handleFileChange}
//                     required
//                   />
//                 </Form.Group>
//                 <Button variant="primary" type="submit">Issue Diploma</Button>
//               </Form>
//               {tokenId && <Alert variant="success" className="mt-3">Diploma issued successfully! Token ID: {tokenId}</Alert>}
//             </Card.Body>
//           </Card>
//         </Col>
//         <Col>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Retrieve Diploma</Card.Title>
//               <Form onSubmit={handleRetrieve}>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Token ID</Form.Label>
//                   <Form.Control
//                     type="text"
//                     value={tokenId}
//                     onChange={handleTokenIdChange}
//                     placeholder="Token ID"
//                     required
//                   />
//                 </Form.Group>
//                 <Button variant="primary" type="submit">Retrieve Diploma</Button>
//               </Form>
//               {diplomaData && (
//                 <div className="mt-3">
//                   <h5>Diploma Details</h5>
//                   <p><strong>Student Name:</strong> {diplomaData.studentName}</p>
//                   <p><strong>Student ID:</strong> {diplomaData.studentID}</p>
//                   <p><strong>Institution Name:</strong> {diplomaData.institutionName}</p>
//                   <p><strong>Degree:</strong> {diplomaData.degree}</p>
//                   <img src={diplomaData.image.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')} alt="Diploma" className="img-fluid" />
//                 </div>
//               )}
//             </Card.Body>
//           </Card>
//         </Col>
//       </Row>
//       <Card className="mt-4">
//         <Card.Body>
//           <Card.Title>Request Issuer Authorization</Card.Title>
//           <Button onClick={handleRequestAuthorization}>Request Authorization</Button>
//           {requestMessage && <Alert variant="info" className="mt-3">{requestMessage}</Alert>}
//         </Card.Body>
//       </Card>
//       {isAuthorizedIssuer && (
//         <Card className="mt-4">
//           <Card.Body>
//             <Card.Title>Pending Requests</Card.Title>
//             {pendingRequests.length === 0 ? (
//               <Alert variant="info">No pending requests</Alert>
//             ) : (
//               pendingRequests.map((request) => (
//                 <div key={request.requestId}>
//                   <p><strong>Requester:</strong> {request.requester}</p>
//                   <p><strong>Approvals:</strong> {request.approvals}</p>
//                   <p><strong>Rejections:</strong> {request.rejections}</p>
//                   <Button variant="success" className="me-2" onClick={() => handleVoteOnRequest(request.requestId, true)}>Approve</Button>
//                   <Button variant="danger" onClick={() => handleVoteOnRequest(request.requestId, false)}>Reject</Button>
//                   <hr />
//                 </div>
//               ))
//             )}
//           </Card.Body>
//         </Card>
//       )}
//     </Container>
//   );
// };
// 
// export default IssueDiploma;
// 
















// import React, { useState, useEffect } from 'react';
// import Web3 from 'web3';
// import axios from 'axios';
// import diplomaNFTAbi from '../DiplomaNFT.json';
// 
// const IssueDiploma = () => {
//   const [form, setForm] = useState({
//     studentName: '',
//     studentID: '',
//     institutionName: '',
//     degree: '',
//     image: null,
//   });
// 
//   const [tokenId, setTokenId] = useState('');
//   const [diplomaData, setDiplomaData] = useState(null);
//   const [requestMessage, setRequestMessage] = useState('');
//   const [account, setAccount] = useState('');
//   const [pendingRequests, setPendingRequests] = useState([]);
//   const [isAuthorizedIssuer, setIsAuthorizedIssuer] = useState(false);
// 
//   useEffect(() => {
//     const loadWeb3 = async () => {
//       if (window.ethereum) {
//         window.web3 = new Web3(window.ethereum);
//         try {
//           await window.ethereum.enable();
//           const accounts = await window.web3.eth.getAccounts();
//           setAccount(accounts[0]);
//           await checkAuthorizedIssuer(accounts[0]);
//           await fetchPendingRequests();
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
// 
//   const checkAuthorizedIssuer = async (account) => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const isAuthorized = await contract.methods.authorizedIssuers(account).call();
//     setIsAuthorizedIssuer(isAuthorized.isActive);
//   };
// 
//   const fetchPendingRequests = async () => {
//     const web3 = window.web3;
//     const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//     const requestIds = await contract.methods.getPendingRequestIds().call();
//     const requests = await Promise.all(requestIds.map(async (requestId) => {
//       const request = await contract.methods.issuerRequests(requestId).call();
//       return { requestId, ...request };
//     }));
//     setPendingRequests(requests);
//   };
// 
//   const handleChange = (e) => {
//     setForm({ ...form, [e.target.name]: e.target.value });
//   };
// 
//   const handleFileChange = (e) => {
//     setForm({ ...form, image: e.target.files[0] });
//   };
// 
//   const handleTokenIdChange = (e) => {
//     setTokenId(e.target.value);
//   };
// 
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
// 
//       console.log('Image uploaded to IPFS:', imageHash);
// 
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
// 
//       console.log('Metadata uploaded to IPFS:', metadataHash);
// 
//       // Interact with smart contract
//       const web3 = window.web3;
//       const accounts = await web3.eth.getAccounts();
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       const tx = await contract.methods
//         .issueDiploma(
//           form.studentName,
//           form.studentID,
//           form.institutionName,
//           form.degree,
//           metadataHash,
//           `ipfs://${metadataHash}`
//         )
//         .send({ from: accounts[0] });
// 
//       const newTokenId = tx.events.DiplomaIssued.returnValues.tokenId; // Retrieve the token ID from the event log
//       setTokenId(newTokenId); // Set the token ID state
//       console.log('Diploma issued on blockchain with token ID:', newTokenId);
//       alert(`Diploma issued successfully! Token ID: ${newTokenId}`);
//     } catch (error) {
//       console.error('Error issuing diploma:', error);
//       alert('Failed to issue diploma');
//     }
//   };
// 
//   const handleRetrieve = async (e) => {
//     e.preventDefault();
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       const tokenURI = await contract.methods.getDiploma(tokenId).call();
// 
//       console.log('Retrieved tokenURI from blockchain:', tokenURI);
// 
//       // Fetch the metadata from IPFS
//       const response = await axios.get(tokenURI.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/'));
//       console.log('Retrieved metadata from IPFS:', response.data);
//       setDiplomaData(response.data);
//     } catch (error) {
//       console.error('Error retrieving diploma:', error);
//       alert('Failed to retrieve diploma');
//     }
//   };
// 
//   const handleRequestAuthorization = async () => {
//     if (isAuthorizedIssuer) {
//       setRequestMessage('You are already an authorized issuer.');
//       return;
//     }
// 
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.requestAuthorization().send({ from: account, value: Web3.utils.toWei('0.001', 'ether') });
//       setRequestMessage('Authorization request submitted successfully.');
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error requesting authorization:', error);
//       setRequestMessage('Failed to submit authorization request.');
//     }
//   };
// 
//   const handleVoteOnRequest = async (requestId, approve) => {
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await contract.methods.voteOnIssuerRequest(requestId, approve).send({ from: account });
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error voting on request:', error);
//     }
//   };
// 
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
// 
//       {tokenId && <p>Diploma issued successfully! Token ID: {tokenId}</p>}
// 
//       <hr />
// 
//       <form onSubmit={handleRetrieve}>
//         <input type="text" value={tokenId} onChange={handleTokenIdChange} placeholder="Token ID" required />
//         <button type="submit">Retrieve Diploma</button>
// 
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
// 
//       <hr />
// 
//       <div>
//         <h2>Request Issuer Authorization</h2>
//         <button onClick={handleRequestAuthorization}>Request Authorization</button>
//         {requestMessage && <p>{requestMessage}</p>}
//       </div>
// 
//       {isAuthorizedIssuer && (
//         <div>
//           <h2>Pending Requests</h2>
//           {pendingRequests.length === 0 ? (
//             <p>No pending requests</p>
//           ) : (
//             pendingRequests.map((request) => (
//               <div key={request.requestId}>
//                 <p>Requester: {request.requester}</p>
//                 <p>Approvals: {request.approvals}</p>
//                 <p>Rejections: {request.rejections}</p>
//                 <button onClick={() => handleVoteOnRequest(request.requestId, true)}>Approve</button>
//                 <button onClick={() => handleVoteOnRequest(request.requestId, false)}>Reject</button>
//               </div>
//             ))
//           )}
//         </div>
//       )}
//     </div>
//   );
// };
// 
// export default IssueDiploma;


