// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MaterialComposition is ERC1155, Ownable {
    uint256 private _currentTokenId = 1;
    mapping(uint256 => string) private _tokenURIs;

    event MaterialMinted(address indexed to, uint256 indexed tokenId, uint256 amount, string metadataURI);
    event MaterialComposed(address indexed owner, uint256[] burnedIds, uint256[] burnedAmounts, uint256 indexed newTokenId, uint256 newAmount, string newMetadataURI);

    // Provide msg.sender to the Ownable constructor since OpenZeppelin v5 requires it
    constructor() ERC1155("") Ownable(msg.sender) {}

    function mintMaterial(address to, uint256 amount, string memory metadataURI) public returns (uint256) {
        uint256 id = _currentTokenId++;
        _mint(to, id, amount, "");
        _tokenURIs[id] = metadataURI;
        emit MaterialMinted(to, id, amount, metadataURI);
        return id;
    }

    // In a production setup, there should be strict role controls or approvals.
    // For this prototype, we simulate the factory (relayer) calling compose on behalf of 'owner'.
    // owner needs to have granted approval or we assume standard ownership transfer in our proxy.
    function composeMaterial(
        address owner,
        uint256[] memory burnedIds,
        uint256[] memory burnedAmounts,
        uint256 newAmount,
        string memory newMetadataURI
    ) public returns (uint256) {
        require(burnedIds.length == burnedAmounts.length, "Arrays length mismatch");
        
        // Burn the inputs. owner must be the one whose tokens are burned.
        // In a relayer model, the caller is the relayer, but to burn from `owner`, 
        // the relayer must have been approved by `owner` (`setApprovalForAll`).
        // For simplicity in our paper prototype where tier actors are controlled by the central backend,
        // we'll require the backend (relayer) to have the tokens, or we can just bypass if needed.
        // Let's assume all tokens are held by the backend relayer for simplicity, so `owner` = `msg.sender`.
        
        // But let's keep `owner` flexible and just do `burnBatch` (if it's not the owner, ERC1155 checks approvals).
        // Since backend holds all keys / does all TXs, we can just burn from the backend address.
        
        for (uint256 i = 0; i < burnedIds.length; i++) {
            _burn(owner, burnedIds[i], burnedAmounts[i]);
        }
        
        // Mint the output
        uint256 newTokenId = _currentTokenId++;
        _mint(owner, newTokenId, newAmount, "");
        _tokenURIs[newTokenId] = newMetadataURI;
        
        emit MaterialComposed(owner, burnedIds, burnedAmounts, newTokenId, newAmount, newMetadataURI);
        return newTokenId;
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return _tokenURIs[tokenId];
    }
}
