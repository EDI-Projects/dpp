pragma solidity ^0.8.20;

/**
 * @title DPPAnchor
 * @notice Minimal on-chain anchor for Digital Product Passport credentials.
 *         Stores IPFS CID hashes and revocation events. Only the deployer
 *         (platform root) can write anchors.
 */
contract DPPAnchor {
    address public owner;

    struct Anchor {
        string  ipfsCid;
        string  vcType;
        uint256 timestamp;
        bool    revoked;
        string  revokeReason;
    }

    // credentialHash => Anchor
    mapping(bytes32 => Anchor) public anchors;

    event CredentialAnchored(
        bytes32 indexed credentialHash,
        string  ipfsCid,
        string  vcType,
        uint256 timestamp
    );

    event CredentialRevoked(
        bytes32 indexed credentialHash,
        string  reason,
        uint256 timestamp
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Anchor a credential's IPFS CID on-chain.
     * @param credentialHash keccak256 of the credential ID string
     * @param ipfsCid        IPFS content identifier
     * @param vcType         Verifiable Credential type name
     */
    function anchorCredential(
        bytes32 credentialHash,
        string calldata ipfsCid,
        string calldata vcType
    ) external onlyOwner {
        require(bytes(anchors[credentialHash].ipfsCid).length == 0, "Already anchored");
        anchors[credentialHash] = Anchor({
            ipfsCid:      ipfsCid,
            vcType:       vcType,
            timestamp:    block.timestamp,
            revoked:      false,
            revokeReason: ""
        });
        emit CredentialAnchored(credentialHash, ipfsCid, vcType, block.timestamp);
    }

    /**
     * @notice Revoke a previously anchored credential.
     * @param credentialHash keccak256 of the credential ID string
     * @param reason         Human-readable revocation reason
     */
    function revokeCredential(
        bytes32 credentialHash,
        string calldata reason
    ) external onlyOwner {
        require(bytes(anchors[credentialHash].ipfsCid).length > 0, "Not anchored");
        require(!anchors[credentialHash].revoked, "Already revoked");
        anchors[credentialHash].revoked = true;
        anchors[credentialHash].revokeReason = reason;
        emit CredentialRevoked(credentialHash, reason, block.timestamp);
    }

    /**
     * @notice Read an anchor's data.
     */
    function getAnchor(bytes32 credentialHash) external view returns (
        string memory ipfsCid,
        string memory vcType,
        uint256 timestamp,
        bool revoked,
        string memory revokeReason
    ) {
        Anchor storage a = anchors[credentialHash];
        return (a.ipfsCid, a.vcType, a.timestamp, a.revoked, a.revokeReason);
    }
}
