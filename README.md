// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
//
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DiplomaNFT
 * @dev A contract to manage the issuance and verification of diplomas as NFTs
 */
contract DiplomaNFT is ERC721URIStorage {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    // Struct to store issuer details
    struct Issuer {
        bool isActive;
        uint256 lastActiveTimestamp;
        uint256 lastVotedTimestamp;
    }

    // Struct to store issuer request details
    struct IssuerRequest {
        address requester;
        uint256 approvals;
        uint256 rejections;
        bool processed;
        mapping(address => bool) voted;
    }

    mapping(address => Issuer) public authorizedIssuers;
    mapping(address => bool) public issuers;
    mapping(bytes32 => IssuerRequest) public issuerRequests;

    uint256 public constant INACTIVITY_PERIOD = 5 * 365 * 24 * 60 * 60;
    uint256 public constant VOTING_PERIOD = 30 * 24 * 60 * 60;
    uint256 public constant REQUEST_COOLDOWN = 7 * 24 * 60 * 60;
    uint256 public constant REQUEST_FEE = 0.001 ether;
    uint256 public constant MAX_PENDING_REQUESTS = 5;

    uint256 public pendingRequests;

    event DiplomaIssued(uint256 indexed tokenId, address indexed issuer, string studentName, string degree);
    event IssuerRequestSubmitted(bytes32 indexed requestId, address indexed requester);
    event IssuerRequestVoted(bytes32 indexed requestId, address indexed voter, bool approve);
    event IssuerAuthorized(address indexed issuer);
    event IssuerRevoked(address indexed issuer);

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender].isActive, "Not an authorized issuer");
        _;
    }

    modifier limitPendingRequests() {
        require(pendingRequests < MAX_PENDING_REQUESTS, "Too many pending requests");
        _;
    }

    // Constructor to initialize the contract
    constructor(address[] memory initialIssuers) ERC721("DiplomaNFT", "DiplTK") {
        for (uint256 i = 0; i < initialIssuers.length; i++) {
            issuers[initialIssuers[i]] = true;
            authorizedIssuers[initialIssuers[i]] = Issuer(true, block.timestamp, block.timestamp);
        }
    }

    /**
     * @dev Requests authorization as an issuer.
     */
    function requestAuthorization() public payable limitPendingRequests {
        require(msg.value >= REQUEST_FEE, "Insufficient fee");
        require(!authorizedIssuers[msg.sender].isActive, "Already an authorized issuer");
        require(block.timestamp > authorizedIssuers[msg.sender].lastVotedTimestamp + REQUEST_COOLDOWN, "Cooldown period active");

        bytes32 requestId = keccak256(abi.encodePacked(msg.sender, block.timestamp));
        IssuerRequest storage request = issuerRequests[requestId];
        request.requester = msg.sender;
        pendingRequests++;

        emit IssuerRequestSubmitted(requestId, msg.sender);
    }

    /**
     * @dev Stakeholders vote on issuer requests.
     * @param requestId The ID of the issuer request.
     * @param approve True to approve the request, false to reject.
     */
    function voteOnIssuerRequest(bytes32 requestId, bool approve) public onlyAuthorizedIssuer {
        IssuerRequest storage request = issuerRequests[requestId];
        require(!request.processed, "Request already processed");
        require(!request.voted[msg.sender], "Already voted");

        request.voted[msg.sender] = true;
        authorizedIssuers[msg.sender].lastVotedTimestamp = block.timestamp;

        if (approve) {
            request.approvals++;
        } else {
            request.rejections++;
        }

        emit IssuerRequestVoted(requestId, msg.sender, approve);

        uint256 issuerCount = getIssuerCount();
        uint256 requiredApprovals = (issuerCount * 65) / 100;

        if (request.approvals >= requiredApprovals) {
            authorizedIssuers[request.requester] = Issuer(true, block.timestamp, block.timestamp);
            request.processed = true;
            issuers[request.requester] = true;
            pendingRequests--;
            emit IssuerAuthorized(request.requester);
        } else if (request.rejections > (issuerCount / 2)) {
            request.processed = true;
            pendingRequests--;
        }
    }

    /**
     * @dev Issues a diploma as an NFT.
     * @param studentName The name of the student.
     * @param studentID The ID number of the student.
     * @param institutionName The name of the institution.
     * @param degree The degree awarded.
     * @param ipfsHash The IPFS hash of the diploma document.
     * @param _tokenURI The URI of the token metadata.
     * @return tokenId The token ID of the issued diploma.
     */
    function issueDiploma(
        string memory studentName,
        string memory studentID,
        string memory institutionName,
        string memory degree,
        string memory ipfsHash,
        string memory _tokenURI
    ) public onlyAuthorizedIssuer returns (uint256 tokenId) {
        if (pendingRequests > 0) {
            bytes32 firstRequestId = getFirstPendingRequest();
            voteOnIssuerRequest(firstRequestId, true);
        }

        tokenId = _tokenIds.current();
        _tokenIds.increment();

        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);

        emit DiplomaIssued(tokenId, msg.sender, studentName, degree);
    }

    /**
     * @dev Gets the count of active issuers.
     * @return The count of active issuers.
     */
    function getIssuerCount() internal view returns (uint256) {
        uint256 count = 0;
        for (uint256 i = 0; i < _tokenIds.current(); i++) {
            if (issuers[address(uint160(i))]) {
                count++;
            }
        }
        return count;
    }

    /**
     * @dev Retrieves a diploma's details.
     * @param tokenId The token ID of the diploma.
     * @return The token URI.
     */
    function getDiploma(uint256 tokenId) public view returns (string memory) {
        require(ownerOf(tokenId) != address(0), "Diploma not found");
        return tokenURI(tokenId);
    }

    /**
     * @dev Gets the first pending request ID.
     * @return The ID of the first pending request.
     */
    function getFirstPendingRequest() internal view returns (bytes32) {
        for (uint256 i = 0; i < _tokenIds.current(); i++) {
            bytes32 requestId = keccak256(abi.encodePacked(address(uint160(i)), block.timestamp));
            if (!issuerRequests[requestId].processed) {
                return requestId;
            }
        }
        revert("No pending requests found");
    }

    // The following functions are overrides required by Solidity.
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // Fallback function to accept ETH
    receive() external payable {}

    // Fallback function for any other type of call
    fallback() external payable {}
}



# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
