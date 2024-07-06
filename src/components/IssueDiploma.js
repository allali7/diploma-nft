import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import axios from 'axios';
import diplomaNFTAbi from '../DiplomaNFT.json';
import { Container, Form, Button, Alert, Card, Row, Col } from 'react-bootstrap';
import TrustCertLogo from './TrustCertLogo.png';
import '../IssueDiploma.css'; 

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
  const [filter, setFilter] = useState({
    studentID: '',
    studentName: ''
  });
  const [filteredDiplomas, setFilteredDiplomas] = useState([]);
  const [issueMessage, setIssueMessage] = useState('');

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
      setIssueMessage(`Diploma issued successfully! Token ID: ${newTokenId}`);
      console.log('Diploma issued on blockchain with token ID:', newTokenId);
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

  const handleFilterChange = (e) => {
    setFilter({ ...filter, [e.target.name]: e.target.value });
  };

  const handleFilterSubmit = async (e) => {
    e.preventDefault();
    try {
      const web3 = window.web3;
      const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
      let filteredDiplomas = [];
      if (filter.studentID) {
        filteredDiplomas = await contract.methods.getDiplomasByStudentID(filter.studentID).call();
      } else if (filter.studentName) {
        filteredDiplomas = await contract.methods.getDiplomasByStudentName(filter.studentName).call();
      }
      setFilteredDiplomas(filteredDiplomas);
    } catch (error) {
      console.error('Error fetching filtered diplomas:', error);
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
              {issueMessage && <Alert variant="success" className="mt-3">{issueMessage}</Alert>}
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
        <>
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
          <Card className="mt-4">
            <Card.Body>
              <Card.Title>Filter Diplomas</Card.Title>
              <Form onSubmit={handleFilterSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Student ID</Form.Label>
                  <Form.Control
                    type="text"
                    name="studentID"
                    value={filter.studentID}
                    onChange={handleFilterChange}
                    placeholder="Student ID"
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Student Name</Form.Label>
                  <Form.Control
                    type="text"
                    name="studentName"
                    value={filter.studentName}
                    onChange={handleFilterChange}
                    placeholder="Student Name"
                  />
                </Form.Group>
                <Button variant="primary" type="submit">Filter</Button>
              </Form>
              {filteredDiplomas.length > 0 && (
                <div className="mt-3">
                  <h5>Filtered Diplomas</h5>
                  {filteredDiplomas.map((tokenId, index) => (
                    <p key={index}>Token ID: {tokenId}</p>
                  ))}
                </div>
              )}
            </Card.Body>
          </Card>
        </>
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
// import TrustCertLogo from './TrustCertLogo.png';
// import '../IssueDiploma.css'; 

// const IssueDiploma = () => {
//   const [form, setForm] = useState({
//     studentName: '',
//     studentID: '',
//     institutionName: '',
//     degree: '',
//     image: null,
//     requesterInstitutionName: '',
//     requesterInstitutionID: '',
//   });

//   const [tokenId, setTokenId] = useState('');
//   const [diplomaData, setDiplomaData] = useState(null);
//   const [requestMessage, setRequestMessage] = useState('');
//   const [account, setAccount] = useState('');
//   const [pendingRequests, setPendingRequests] = useState([]);
//   const [isAuthorizedIssuer, setIsAuthorizedIssuer] = useState(false);
//   const [filter, setFilter] = useState({
//     institutionName: '',
//     studentID: '',
//     studentName: ''
//   });
//   const [filteredDiplomas, setFilteredDiplomas] = useState([]);
//   const [issueMessage, setIssueMessage] = useState('');

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
//       setIssueMessage(`Diploma issued successfully! Token ID: ${newTokenId}`);
//       console.log('Diploma issued on blockchain with token ID:', newTokenId);
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
//       await contract.methods.requestAuthorization(form.requesterInstitutionName, form.requesterInstitutionID).send({ from: account, value: Web3.utils.toWei('0.001', 'ether') });
//       setRequestMessage('Authorization request submitted successfully.');
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error requesting authorization:', error);
//       setRequestMessage('Failed to submit authorization request.');
//     }
//   };

//   const handleVoteOnRequest = async (requestIds, approve) => {
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       await Promise.all(requestIds.map(async (requestId) => {
//         await contract.methods.voteOnIssuerRequest(requestId, approve).send({ from: account });
//       }));
//       await fetchPendingRequests(); // Refresh the pending requests
//     } catch (error) {
//       console.error('Error voting on request:', error);
//     }
//   };

//   const handleFilterChange = (e) => {
//     setFilter({ ...filter, [e.target.name]: e.target.value });
//   };

//   const handleFilterSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       const web3 = window.web3;
//       const contract = new web3.eth.Contract(diplomaNFTAbi, process.env.REACT_APP_CONTRACT_ADDRESS);
//       let filteredDiplomas = [];
//       if (filter.institutionName) {
//         filteredDiplomas = await contract.methods.getDiplomasByInstitution(filter.institutionName).call();
//       } else if (filter.studentID) {
//         filteredDiplomas = await contract.methods.getDiplomasByStudentID(filter.studentID).call();
//       } else if (filter.studentName) {
//         filteredDiplomas = await contract.methods.getDiplomasByStudentName(filter.studentName).call();
//       }
//       setFilteredDiplomas(filteredDiplomas);
//     } catch (error) {
//       console.error('Error fetching filtered diplomas:', error);
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
//               {issueMessage && <Alert variant="success" className="mt-3">{issueMessage}</Alert>}
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
//           <Form>
//             <Form.Group className="mb-3">
//               <Form.Label>Institution Name</Form.Label>
//               <Form.Control
//                 type="text"
//                 name="requesterInstitutionName"
//                 value={form.requesterInstitutionName}
//                 onChange={handleChange}
//                 placeholder="Institution Name"
//                 required
//               />
//             </Form.Group>
//             <Form.Group className="mb-3">
//               <Form.Label>Institution ID</Form.Label>
//               <Form.Control
//                 type="text"
//                 name="requesterInstitutionID"
//                 value={form.requesterInstitutionID}
//                 onChange={handleChange}
//                 placeholder="Institution ID"
//                 required
//               />
//             </Form.Group>
//             <Button onClick={handleRequestAuthorization}>Request Authorization</Button>
//           </Form>
//           {requestMessage && <Alert variant="info" className="mt-3">{requestMessage}</Alert>}
//         </Card.Body>
//       </Card>
//       {isAuthorizedIssuer && (
//         <>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Pending Requests</Card.Title>
//               {pendingRequests.length === 0 ? (
//                 <Alert variant="info">No pending requests</Alert>
//               ) : (
//                 <Form>
//                   {pendingRequests.map((request) => (
//                     <div key={request.requestId}>
//                       <Form.Check
//                         type="checkbox"
//                         label={`Requester: ${request.requester}, Institution: ${request.institutionName}, ID: ${request.institutionID}`}
//                         id={request.requestId}
//                       />
//                     </div>
//                   ))}
//                   <Button variant="success" className="mt-3" onClick={() => handleVoteOnRequest(pendingRequests.map(req => req.requestId), true)}>Approve Selected</Button>
//                   <Button variant="danger" className="mt-3 ms-3" onClick={() => handleVoteOnRequest(pendingRequests.map(req => req.requestId), false)}>Reject Selected</Button>
//                 </Form>
//               )}
//             </Card.Body>
//           </Card>
//           <Card className="mt-4">
//             <Card.Body>
//               <Card.Title>Filter Diplomas</Card.Title>
//               <Form onSubmit={handleFilterSubmit}>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Institution Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="institutionName"
//                     value={filter.institutionName}
//                     onChange={handleFilterChange}
//                     placeholder="Institution Name"
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student ID</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentID"
//                     value={filter.studentID}
//                     onChange={handleFilterChange}
//                     placeholder="Student ID"
//                   />
//                 </Form.Group>
//                 <Form.Group className="mb-3">
//                   <Form.Label>Student Name</Form.Label>
//                   <Form.Control
//                     type="text"
//                     name="studentName"
//                     value={filter.studentName}
//                     onChange={handleFilterChange}
//                     placeholder="Student Name"
//                   />
//                 </Form.Group>
//                 <Button variant="primary" type="submit">Filter</Button>
//               </Form>
//               {filteredDiplomas.length > 0 && (
//                 <div className="mt-3">
//                   <h5>Filtered Diplomas</h5>
//                   {filteredDiplomas.map((tokenId, index) => (
//                     <p key={index}>Token ID: {tokenId}</p>
//                   ))}
//                 </div>
//               )}
//             </Card.Body>
//           </Card>
//         </>
//       )}
//     </Container>
//   );
// };

// export default IssueDiploma;


